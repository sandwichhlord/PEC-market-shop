import { describe, expect, it } from "vitest";
import { requireOrderAccess, requireRole, requireShopOwner, requireUser } from "@/server/auth/guards";
import { HttpError } from "@/server/http";
import { apiRequest, createOrder, createShopOwner, createUser, sessionCookie } from "../helpers/fixtures";

async function asUser(user: { id: string; role: "CUSTOMER" | "SHOP_OWNER" | "ADMIN" }) {
  return apiRequest("/api/anything", { cookie: await sessionCookie(user) });
}

async function expectHttpError(promise: Promise<unknown>, status: number, code?: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
  if (code) expect((err as HttpError).code).toBe(code);
}

describe("requireUser", () => {
  it("returns the user for a valid session", async () => {
    const user = await createUser();
    expect((await requireUser(await asUser(user))).id).toBe(user.id);
  });

  it("401s without a session or for a deleted user", async () => {
    await expectHttpError(requireUser(apiRequest("/x")), 401, "UNAUTHENTICATED");
    await expectHttpError(requireUser(apiRequest("/x", { cookie: "pec_session=garbage" })), 401);
    await expectHttpError(
      requireUser(apiRequest("/x", { cookie: await sessionCookie({ id: "does-not-exist", role: "CUSTOMER" }) })),
      401,
    );
  });

  it("403s a suspended user of any role", async () => {
    for (const role of ["CUSTOMER", "SHOP_OWNER", "ADMIN"] as const) {
      const user = await createUser({ role, status: "SUSPENDED" });
      await expectHttpError(requireUser(await asUser(user)), 403, "ACCOUNT_SUSPENDED");
    }
  });

  it("lets a warned user through", async () => {
    const user = await createUser({ status: "WARNED", warningMessage: "careful" });
    expect((await requireUser(await asUser(user))).warningMessage).toBe("careful");
  });
});

describe("requireRole", () => {
  it("allows listed roles and 403s others", async () => {
    const customer = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    expect((await requireRole(await asUser(admin), "ADMIN")).id).toBe(admin.id);
    expect((await requireRole(await asUser(customer), "CUSTOMER", "ADMIN")).id).toBe(customer.id);
    await expectHttpError(requireRole(await asUser(customer), "ADMIN"), 403, "FORBIDDEN");
    await expectHttpError(requireRole(await asUser(admin), "SHOP_OWNER"), 403, "FORBIDDEN");
  });
});

describe("requireShopOwner", () => {
  it("allows the owner, 403s another owner, 404s an unknown shop", async () => {
    const a = await createShopOwner();
    const b = await createShopOwner();
    expect((await requireShopOwner(await asUser(a.owner), a.shop.id)).shop.id).toBe(a.shop.id);
    await expectHttpError(requireShopOwner(await asUser(b.owner), a.shop.id), 403, "FORBIDDEN");
    await expectHttpError(requireShopOwner(await asUser(a.owner), "no-such-shop"), 404);
  });

  it("403s customers and admins", async () => {
    const { shop } = await createShopOwner();
    await expectHttpError(requireShopOwner(await asUser(await createUser()), shop.id), 403);
    await expectHttpError(requireShopOwner(await asUser(await createUser({ role: "ADMIN" })), shop.id), 403);
  });
});

describe("requireOrderAccess", () => {
  it("allows the customer, the shop owner and admins; hides the order from everyone else", async () => {
    const customer = await createUser();
    const otherCustomer = await createUser();
    const { owner, shop } = await createShopOwner();
    const other = await createShopOwner();
    const admin = await createUser({ role: "ADMIN" });
    const order = await createOrder(customer.id, shop.id);

    expect((await requireOrderAccess(await asUser(customer), order.id)).access).toBe("customer");
    expect((await requireOrderAccess(await asUser(owner), order.id)).access).toBe("shop");
    expect((await requireOrderAccess(await asUser(admin), order.id)).access).toBe("admin");
    await expectHttpError(requireOrderAccess(await asUser(otherCustomer), order.id), 404);
    await expectHttpError(requireOrderAccess(await asUser(other.owner), order.id), 404);
    await expectHttpError(requireOrderAccess(apiRequest("/x"), order.id), 401);
  });
});
