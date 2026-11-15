import { expect, test, type Page } from "@playwright/test";

// Seeded data (prisma/seed-data.ts): student1 has PEC1003 (Combo Juice Bar, shop3) PREPARING, PEC1001 and
// PEC1002 COMPLETED and PEC1004 PAYMENT_FAILED. student2 has PEC1005–PEC1008. No other spec touches PEC1003.
async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(landing);
}

const card = (page: Page, orderNumber: string) =>
  page.getByTestId("order-card").filter({ visible: true, hasText: `#${orderNumber}` });
// `visible: true`: on a slow host, React's streamed copy of the page can linger in a hidden <div id="S:0">.
const step = (page: Page, status: string) =>
  page.getByTestId("order-progress").filter({ visible: true }).locator(`[data-step="${status}"]`);

test("order history has Active and Past tabs", async ({ page }) => {
  await logIn(page, "/login", "student1@pec.test", "student123", /\/shops$/);
  await page.getByRole("link", { name: "Orders" }).first().click();
  await expect(page).toHaveURL(/\/orders$/);

  const tabs = page.getByRole("navigation", { name: "Order history" });
  await expect(tabs.getByRole("link", { name: /Active/ })).toHaveAttribute("aria-current", "page");
  await expect(card(page, "PEC1003")).toBeVisible();
  await expect(card(page, "PEC1003").locator("[data-status]")).toHaveAttribute("data-status", "PREPARING");
  await expect(card(page, "PEC1001")).toHaveCount(0);

  await tabs.getByRole("link", { name: /Past/ }).click();
  await expect(page).toHaveURL(/\/orders\?tab=past$/);
  await expect(tabs.getByRole("link", { name: /Past/ })).toHaveAttribute("aria-current", "page");
  // Newest first: PEC1004 (1 day ago), PEC1002 (2 days), PEC1001 (3 days).
  await expect(page.getByTestId("order-card").filter({ visible: true })).toHaveCount(3);
  const numbers = await page.getByTestId("order-card").filter({ visible: true }).allTextContents();
  expect(numbers.map((t) => /#(PEC\d+)/.exec(t)?.[1])).toEqual(["PEC1004", "PEC1002", "PEC1001"]);
  await expect(card(page, "PEC1003")).toHaveCount(0);

  // A failed payment explains itself and points back to the cart.
  await card(page, "PEC1004").click();
  await expect(page.getByRole("heading", { name: "Order #PEC1004" })).toBeVisible();
  // (Next's route announcer is also role=alert, so match by text.)
  await expect(page.getByRole("alert").filter({ hasText: "Payment failed" })).toContainText("not sent to the shop");
  await expect(page.getByRole("link", { name: "try again from your cart" })).toHaveAttribute("href", "/cart");
  await expect(page.getByTestId("order-progress")).toHaveCount(0);
});

test("order page shows the timeline and estimated ready time, and follows the shop's updates", async ({ page, browser }) => {
  await logIn(page, "/login", "student1@pec.test", "student123", /\/shops$/);
  await page.goto("/orders");
  await card(page, "PEC1003").click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+$/);
  const orderId = new URL(page.url()).pathname.split("/").pop()!;

  await expect(page.getByRole("heading", { name: "Order #PEC1003" })).toBeVisible();
  await expect(page.getByText("Combo Juice Bar").first()).toBeVisible();
  await expect(step(page, "PLACED_PAID")).toHaveAttribute("data-state", "done");
  await expect(step(page, "PREPARING")).toHaveAttribute("data-state", "current");
  await expect(step(page, "READY_FOR_PICKUP")).toHaveAttribute("data-state", "upcoming");
  await expect(page.getByTestId("ready-estimate").filter({ visible: true })).toHaveText(/Estimated ready by \d{1,2}:\d{2}\s?[ap]m|Should be ready any minute/i);
  const timeline = page.getByTestId("order-timeline").filter({ visible: true });
  await expect(timeline.locator("li")).toHaveCount(3);
  await expect(timeline.locator("li").nth(0)).toContainText("Order created");
  await expect(timeline.locator("li").nth(2)).toContainText("Preparing");
  await expect(timeline.locator("li").nth(2)).toContainText("Combo Juice Bar");

  // The shop marks it ready, then completed; the customer's page reflects each change on reload (live push is P08).
  const shop = await browser.newContext();
  const shopPage = await shop.newPage();
  await logIn(shopPage, "/shop/login", "shop3@pec.test", "shop123", /\/shop$/);
  await shopPage.goto(`/shop/orders/${orderId}`);
  await shopPage.getByRole("button", { name: /Ready for pickup/ }).click();
  await expect(shopPage.getByRole("button", { name: /Mark completed/ })).toBeVisible();

  await page.reload();
  await expect(step(page, "PREPARING")).toHaveAttribute("data-state", "done");
  await expect(step(page, "READY_FOR_PICKUP")).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("ready-estimate").filter({ visible: true })).toContainText("Ready for pickup since");

  await shopPage.getByRole("button", { name: /Mark completed/ }).click();
  await expect(shopPage.getByRole("button", { name: /Mark completed/ })).toHaveCount(0);
  await shop.close();

  await page.reload();
  await expect(page.locator("main [data-status]").filter({ visible: true }).first()).toHaveAttribute("data-status", "COMPLETED");
  await expect(step(page, "COMPLETED")).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("ready-estimate").filter({ visible: true })).toHaveCount(0);
  await expect(timeline.locator("li")).toHaveCount(5);

  // It moved to the Past tab.
  await page.goto("/orders?tab=past");
  await expect(card(page, "PEC1003")).toBeVisible();
});

test("a customer cannot open another customer's order", async ({ page, browser }) => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await logIn(otherPage, "/login", "student2@pec.test", "student123", /\/shops$/);
  await otherPage.goto("/orders?tab=past");
  const href = await card(otherPage, "PEC1005").getAttribute("href");
  expect(href).toMatch(/^\/orders\/[^/]+$/);
  await other.close();

  await logIn(page, "/login", "student1@pec.test", "student123", /\/shops$/);
  await page.goto(href!);
  await expect(page.getByText("Order not found", { exact: true })).toBeVisible();
  await expect(page.getByText("PEC1005")).toHaveCount(0);
  const res = await page.request.get(`/api${href!}`);
  expect(res.status()).toBe(404);
});

test("order page fits a 375px screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await logIn(page, "/login", "student1@pec.test", "student123", /\/shops$/);
  await page.goto("/orders?tab=past");
  await card(page, "PEC1001").click();
  await expect(page.getByRole("heading", { name: "Order #PEC1001" })).toBeVisible();
  await expect(step(page, "COMPLETED")).toHaveAttribute("data-state", "done");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath("order-375.png"), fullPage: true });
});
