import { describe, expect, it } from "vitest";
import { InvalidTransitionError, OrderTransitionError } from "@/lib/order-state";
import { KITCHEN_STATUSES } from "@/lib/order-status";
import { rupeesToPaise } from "@/lib/validation/shop-portal";
import { prisma } from "@/server/db";
import { HttpError } from "@/server/http";
import { changeStatus, notificationsFor, orderChangedError } from "@/server/orders/changeStatus";
import { createOrderWith, createShopOwner, createUser } from "./helpers/fixtures";

async function setup(status: Parameters<typeof createOrderWith>[0]["status"]) {
  const { owner, shop } = await createShopOwner();
  const customer = await createUser();
  const order = await createOrderWith({ customerId: customer.id, shopId: shop.id, status });
  return { owner, shop, customer, order };
}

const notesFor = (userId: string) => prisma.notification.findMany({ where: { userId } });

describe("changeStatus", () => {
  it("SYSTEM payment confirmation: PLACED_PAID, payment fields, NEW_ORDER for the shop and ORDER_STATUS for the customer", async () => {
    const { owner, customer, order } = await setup("PENDING_PAYMENT");
    const changed = await changeStatus({
      orderId: order.id,
      to: "PLACED_PAID",
      actor: { id: null, role: "SYSTEM" },
      payment: { paymentStatus: "PAID", stripePaymentId: "pi_test_123" },
    });
    expect(changed).toMatchObject({ id: order.id, fromStatus: "PENDING_PAYMENT", status: "PLACED_PAID", paymentStatus: "PAID" });

    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      status: "PLACED_PAID",
      paymentStatus: "PAID",
      stripePaymentId: "pi_test_123",
    });
    expect(await prisma.orderEvent.findMany({ where: { orderId: order.id } })).toEqual([
      expect.objectContaining({ fromStatus: "PENDING_PAYMENT", toStatus: "PLACED_PAID", actorId: null }),
    ]);
    expect(await notesFor(owner.id)).toEqual([
      expect.objectContaining({ type: "NEW_ORDER", title: `New order ${order.orderNumber}`, body: "1 item(s) — paid online.", link: `/shop/orders/${order.id}` }),
    ]);
    expect(await notesFor(customer.id)).toEqual([
      expect.objectContaining({ type: "ORDER_STATUS", link: `/orders/${order.id}` }),
    ]);
  });

  it("customer refund request: DISPUTE for the shop, nothing for the customer", async () => {
    const { owner, customer, order } = await setup("PREPARING");
    await changeStatus({ orderId: order.id, to: "REFUND_REQUESTED", actor: { id: customer.id, role: "CUSTOMER" }, note: "Wrong item" });

    expect(await prisma.orderEvent.findMany({ where: { orderId: order.id } })).toEqual([
      expect.objectContaining({ fromStatus: "PREPARING", toStatus: "REFUND_REQUESTED", actorId: customer.id, note: "Wrong item" }),
    ]);
    expect(await notesFor(owner.id)).toEqual([
      expect.objectContaining({ type: "DISPUTE", title: `Refund requested on ${order.orderNumber}`, link: `/shop/orders/${order.id}` }),
    ]);
    expect(await notesFor(customer.id)).toEqual([]);
  });

  it("REFUND_REQUESTED can only return to the status it came from", async () => {
    const { owner, customer, order } = await setup("PREPARING");
    await changeStatus({ orderId: order.id, to: "REFUND_REQUESTED", actor: { id: customer.id, role: "CUSTOMER" } });
    const shopActor = { id: owner.id, role: "SHOP_OWNER" as const };

    for (const wrong of ["PLACED_PAID", "READY_FOR_PICKUP"] as const) {
      const err = await changeStatus({ orderId: order.id, to: wrong, actor: shopActor }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidTransitionError);
      expect((err as OrderTransitionError).httpStatus).toBe(409);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUND_REQUESTED");
    expect(await prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(1);

    const resumed = await changeStatus({ orderId: order.id, to: "PREPARING", actor: shopActor, note: "Rejected" });
    expect(resumed).toMatchObject({ fromStatus: "REFUND_REQUESTED", status: "PREPARING" });
    // The customer hears the refund request was reviewed.
    expect(await notesFor(customer.id)).toEqual([
      expect.objectContaining({ type: "DISPUTE", body: "Your refund request was reviewed. The order continues: Preparing." }),
    ]);
  });

  it("uses the most recent refund request when there were several", async () => {
    const { owner, customer, order } = await setup("REFUND_REQUESTED");
    const now = Date.now();
    await prisma.orderEvent.createMany({
      data: [
        { orderId: order.id, fromStatus: "PLACED_PAID", toStatus: "REFUND_REQUESTED", actorId: customer.id, createdAt: new Date(now - 5000) },
        { orderId: order.id, fromStatus: "REFUND_REQUESTED", toStatus: "PLACED_PAID", actorId: owner.id, createdAt: new Date(now - 4000) },
        { orderId: order.id, fromStatus: "PLACED_PAID", toStatus: "PREPARING", actorId: owner.id, createdAt: new Date(now - 3000) },
        { orderId: order.id, fromStatus: "READY_FOR_PICKUP", toStatus: "REFUND_REQUESTED", actorId: customer.id, createdAt: new Date(now - 1000) },
      ],
    });
    const shopActor = { id: owner.id, role: "SHOP_OWNER" as const };
    await expect(changeStatus({ orderId: order.id, to: "PLACED_PAID", actor: shopActor })).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(changeStatus({ orderId: order.id, to: "READY_FOR_PICKUP", actor: shopActor })).resolves.toMatchObject({
      status: "READY_FOR_PICKUP",
    });
  });

  it("404s an unknown order", async () => {
    const err = await changeStatus({ orderId: "no-such-order", to: "PREPARING", actor: { id: null, role: "SYSTEM" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  it("onlyFrom rejects an order outside the allowed statuses even when the move itself is valid", async () => {
    const { owner, customer, order } = await setup("REFUND_REQUESTED");
    await prisma.orderEvent.create({ data: { orderId: order.id, fromStatus: "PREPARING", toStatus: "REFUND_REQUESTED", actorId: customer.id } });
    const err = await changeStatus({
      orderId: order.id,
      to: "PREPARING",
      actor: { id: owner.id, role: "SHOP_OWNER" },
      onlyFrom: KITCHEN_STATUSES,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidTransitionError);
    expect((err as OrderTransitionError).httpStatus).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUND_REQUESTED");
    expect(await prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(1);
    expect(await notesFor(customer.id)).toEqual([]);
  });

  it("rejects an actor who may not make the move (403) and leaves the order alone", async () => {
    const { customer, order } = await setup("PLACED_PAID");
    const err = await changeStatus({ orderId: order.id, to: "PREPARING", actor: { id: customer.id, role: "CUSTOMER" } }).catch(
      (e: unknown) => e,
    );
    expect((err as OrderTransitionError).httpStatus).toBe(403);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PLACED_PAID");
    expect(await prisma.orderEvent.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("orderChangedError is a 409 ORDER_CHANGED", () => {
    expect(orderChangedError()).toMatchObject({ status: 409, code: "ORDER_CHANGED" });
  });
});

describe("notificationsFor", () => {
  const order = { id: "o1", orderNumber: "PEC-1", customerId: "cust", shopOwnerId: "owner", itemCount: 3 };
  const shop = { id: "owner", role: "SHOP_OWNER" as const };
  const customer = { id: "cust", role: "CUSTOMER" as const };
  const system = { id: null, role: "SYSTEM" as const };
  const brief = (n: ReturnType<typeof notificationsFor>) => n.map((x) => [x.userId, x.type]);

  it("new paid order: shop gets NEW_ORDER, customer gets ORDER_STATUS", () => {
    const out = notificationsFor({ order, from: "PENDING_PAYMENT", to: "PLACED_PAID", actor: system });
    expect(brief(out)).toEqual([
      ["owner", "NEW_ORDER"],
      ["cust", "ORDER_STATUS"],
    ]);
    expect(out[0]).toMatchObject({ title: "New order PEC-1", body: "3 item(s) — paid online.", link: "/shop/orders/o1" });
    expect(out[1]).toMatchObject({ link: "/orders/o1", body: "Payment received — your order has been sent to the shop." });
  });

  it.each(["PREPARING", "READY_FOR_PICKUP", "COMPLETED"] as const)("kitchen move to %s notifies only the customer", (to) => {
    const out = notificationsFor({ order, from: "PLACED_PAID", to, actor: shop });
    expect(brief(out)).toEqual([["cust", "ORDER_STATUS"]]);
  });

  it("disputes raised by the customer notify only the shop", () => {
    expect(brief(notificationsFor({ order, from: "PREPARING", to: "REFUND_REQUESTED", actor: customer }))).toEqual([["owner", "DISPUTE"]]);
    const complaint = notificationsFor({ order, from: "COMPLETED", to: "COMPLAINT_FILED", actor: customer });
    expect(brief(complaint)).toEqual([["owner", "DISPUTE"]]);
    expect(complaint[0]!.title).toBe("Complaint filed on PEC-1");
  });

  it("resuming after a refund request tells the customer with a DISPUTE notification", () => {
    const out = notificationsFor({ order, from: "REFUND_REQUESTED", to: "READY_FOR_PICKUP", actor: shop });
    expect(out).toEqual([expect.objectContaining({ userId: "cust", type: "DISPUTE", body: expect.stringContaining("Ready for pickup") })]);
  });

  it("refund issued tells the customer with ORDER_STATUS", () => {
    const out = notificationsFor({ order, from: "REFUND_REQUESTED", to: "REFUNDED", actor: shop });
    expect(out).toEqual([expect.objectContaining({ userId: "cust", type: "ORDER_STATUS", body: "Your refund has been issued." })]);
  });

  it("statuses without a customer message produce nothing for the customer", () => {
    expect(notificationsFor({ order, from: "PLACED_PAID", to: "PENDING_PAYMENT", actor: system })).toEqual([]);
  });
});

describe("rupeesToPaise", () => {
  it.each([
    ["45", 4500],
    ["45.5", 4550],
    ["45.50", 4550],
    ["0.05", 5],
    ["0", 0],
    [" 12 ", 1200],
  ])("%j → %d", (input, paise) => {
    expect(rupeesToPaise(input)).toBe(paise);
  });

  it.each(["abc", "-1", "1.234", "", "  ", "1,000", "1e3", ".5", "5."])("%j → null", (input) => {
    expect(rupeesToPaise(input)).toBeNull();
  });
});
