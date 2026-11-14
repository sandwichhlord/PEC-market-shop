import { expect, test, type Browser, type Page } from "@playwright/test";

// Seeded data (prisma/seed-data.ts): shop2 = Dakshin Dosa Corner (shop2@pec.test / shop123): Masala Dosa ₹80,
// Filter Coffee ₹25. student2 / student123 (student1's history counts are asserted by orders.spec.ts).
const DOSA_CORNER = "seed_shop2";

// Each test drives two signed-in contexts through checkout plus a whole dispute: more steps than the 30 s default.
test.describe.configure({ timeout: 60_000 });

async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(landing);
}

/** Customer + shop contexts, and a fresh paid order (Masala Dosa + Filter Coffee = ₹105) open on the customer's side. */
async function paidOrder(browser: Browser) {
  const customerContext = await browser.newContext();
  const shopContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const shop = await shopContext.newPage();
  await logIn(customer, "/login", "student2@pec.test", "student123", /\/shops$/);
  await logIn(shop, "/shop/login", "shop2@pec.test", "shop123", /\/shop$/);

  await customer.goto(`/shops/${DOSA_CORNER}`);
  await customer.getByRole("button", { name: "Add Masala Dosa to cart" }).click();
  await customer.getByRole("button", { name: "Add Filter Coffee to cart" }).click();
  await customer.getByRole("region", { name: "Cart summary" }).getByRole("link", { name: "View cart" }).click();
  await customer.getByRole("button", { name: /^Pay / }).click();
  await customer.getByRole("button", { name: /^Pay / }).click();
  await customer.getByRole("link", { name: "Track your order" }).click();
  await expect(customer).toHaveURL(/\/orders\/[^/]+$/);
  const orderId = new URL(customer.url()).pathname.split("/").pop()!;
  await shop.goto(`/shop/orders/${orderId}`);
  return { customer, shop, close: () => Promise.all([customerContext.close(), shopContext.close()]) };
}

const badge = (page: Page) => page.locator("main [data-status]").filter({ visible: true }).first();
const disputes = (page: Page) => page.getByTestId("dispute").filter({ visible: true });

test("customer requests a partial refund; the shop approves it and the customer sees it live", async ({ browser }) => {
  const { customer, shop, close } = await paidOrder(browser);

  await customer.getByRole("button", { name: "Request a refund" }).click();
  const sheet = customer.getByRole("dialog", { name: "Request a refund" });
  await sheet.getByRole("checkbox", { name: /Filter Coffee/ }).check();
  await expect(sheet.getByTestId("refund-amount")).toHaveText("₹25");
  await sheet.getByLabel("Reason").fill("Coffee machine is broken");
  await sheet.getByRole("button", { name: "Request ₹25 refund" }).click();
  await expect(sheet).toBeHidden();
  await expect(badge(customer)).toHaveAttribute("data-status", "REFUND_REQUESTED");
  await expect(disputes(customer).first()).toContainText("Waiting for the shop");

  // The shop's open order page shows the request live and approves it.
  const request = disputes(shop).first();
  await expect(request).toContainText("Coffee machine is broken");
  await expect(request).toContainText("Items: 1× Filter Coffee");
  await request.getByRole("button", { name: "Approve refund (₹25)" }).click();
  await expect(disputes(shop).first()).toHaveAttribute("data-dispute-status", "RESOLVED");

  // The customer's page follows: order back to Placed & paid, partially refunded.
  await expect(badge(customer)).toHaveAttribute("data-status", "PLACED_PAID", { timeout: 5000 });
  await expect(disputes(customer).first()).toHaveAttribute("data-dispute-status", "RESOLVED");
  await expect(customer.getByText("Partially refunded")).toBeVisible();
  await expect(customer.getByText("−₹25")).toBeVisible();
  await expect(customer.getByTestId("toast").filter({ hasText: "A partial refund of ₹25 was issued" })).toBeVisible();

  // Only the dosa is left to refund.
  await customer.getByRole("button", { name: "Request a refund" }).click();
  const again = customer.getByRole("dialog", { name: "Request a refund" });
  await expect(again.getByRole("checkbox", { name: /Masala Dosa/ })).toBeVisible();
  await expect(again.getByRole("checkbox", { name: /Filter Coffee/ })).toHaveCount(0);
  await close();
});

test("a rejected refund goes to the admin; a complaint gets a reply and is resolved", async ({ browser }) => {
  const { customer, shop, close } = await paidOrder(browser);

  await customer.getByRole("button", { name: "Request a refund" }).click();
  const sheet = customer.getByRole("dialog", { name: "Request a refund" });
  await sheet.getByRole("checkbox", { name: "Whole order" }).check();
  await expect(sheet.getByTestId("refund-amount")).toHaveText("₹105");
  await sheet.getByLabel("Reason").fill("Taking too long");
  await sheet.getByRole("button", { name: "Request ₹105 refund" }).click();
  await expect(badge(customer)).toHaveAttribute("data-status", "REFUND_REQUESTED");

  const request = disputes(shop).first();
  await request.getByRole("button", { name: "Reject" }).click();
  await request.getByLabel(/Reason for rejecting/).fill("Your food is almost ready");
  await request.getByRole("button", { name: "Reject refund" }).click();
  await expect(disputes(shop).first()).toHaveAttribute("data-dispute-status", "ESCALATED");
  await expect(badge(customer)).toHaveAttribute("data-status", "PLACED_PAID", { timeout: 5000 });
  await expect(disputes(customer).first()).toContainText("With the market admin");
  await expect(disputes(customer).first()).toContainText("Your food is almost ready");

  // Complaint → reply → resolve.
  await customer.getByRole("button", { name: "Report a problem" }).click();
  const form = customer.getByRole("dialog", { name: "Report a problem" });
  await form.getByLabel("What went wrong?").fill("The counter staff were rude to me.");
  await form.getByRole("button", { name: "Send complaint" }).click();
  await expect(badge(customer)).toHaveAttribute("data-status", "COMPLAINT_FILED");

  const complaint = disputes(shop).filter({ hasText: "The counter staff were rude to me." });
  await expect(complaint).toBeVisible();
  await complaint.getByRole("button", { name: "Reply" }).click();
  await complaint.getByLabel("Your reply").fill("We are sorry, we will talk to them.");
  await complaint.getByRole("button", { name: "Send reply" }).click();
  await expect(customer.getByTestId("toast").filter({ hasText: "The shop replied to your complaint" })).toBeVisible();

  await complaint.getByRole("button", { name: "Mark resolved" }).click();
  await complaint.getByLabel("Resolution note (optional)").fill("Spoke to the staff.");
  await complaint.getByRole("button", { name: "Mark resolved" }).click();
  await expect(badge(customer)).toHaveAttribute("data-status", "RESOLVED", { timeout: 5000 });
  const resolved = disputes(customer).filter({ hasText: "The counter staff were rude to me." });
  await expect(resolved).toContainText("We are sorry, we will talk to them.");
  await expect(resolved).toContainText("Spoke to the staff.");
  await expect(customer.getByRole("button", { name: "Report a problem" })).toHaveCount(0);
  await close();
});
