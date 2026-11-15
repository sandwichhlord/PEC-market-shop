import { expect, test, type Browser, type Page } from "@playwright/test";

// Two browser contexts (customer + shop) talking through Socket.IO, no reloads. Seeded data (prisma/seed-data.ts):
// shop1 = Forks n Knives Cafe (shop1@pec.test / shop123) with Bun Maska and Bread Pakora in stock; student1 / student123.
const CHAI = { id: "seed_shop1", name: "Forks n Knives Cafe" };
const LIVE = { timeout: 3000 };

async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(landing);
}

async function twoPortals(browser: Browser) {
  const customerContext = await browser.newContext();
  const shopContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const shop = await shopContext.newPage();
  await logIn(customer, "/login", "student1@pec.test", "student123", /\/shops$/);
  await logIn(shop, "/shop/login", "shop1@pec.test", "shop123", /\/shop$/);
  return { customer, shop, close: () => Promise.all([customerContext.close(), shopContext.close()]) };
}

test("a paid order appears on the shop dashboard live, and the shop's 'start preparing' reaches the customer within 3 s", async ({
  browser,
}) => {
  const { customer, shop, close } = await twoPortals(browser);

  // The shop is watching its dashboard before the order exists.
  await shop.goto("/shop/orders");
  await expect(shop.getByRole("heading", { name: "Orders", level: 1 })).toBeVisible();

  // The customer orders and pays (mock provider).
  await customer.goto(`/shops/${CHAI.id}`);
  await customer.getByRole("button", { name: "Add Bun Maska to cart" }).click();
  await customer.getByRole("region", { name: "Cart summary" }).getByRole("link", { name: "View cart" }).click();
  await customer.getByRole("button", { name: /^Pay / }).click();
  await expect(customer).toHaveURL(/\/pay\/mock\//);
  await customer.getByRole("button", { name: /^Pay / }).click();
  await expect(customer.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await customer.getByRole("link", { name: "Track your order" }).click();
  await expect(customer).toHaveURL(/\/orders\/[^/]+$/);
  const orderNumber = ((await customer.getByRole("heading", { level: 1 }).textContent()) ?? "").replace("Order #", "").trim();
  expect(orderNumber).toMatch(/^PEC/);
  // `visible: true`: on a slow host, React's streamed copy of the page can linger in a hidden <div id="S:0">.
  const progress = customer.getByTestId("order-progress").filter({ visible: true });
  await expect(progress.locator('[data-step="PLACED_PAID"]')).toHaveAttribute("data-state", "current");

  // New order shows up on the shop's open dashboard without a reload, with a NEW_ORDER toast.
  const card = shop.getByRole("article", { name: `Order ${orderNumber}` });
  await expect(card).toBeVisible({ timeout: 5000 });
  await expect(shop.getByTestId("toast").filter({ hasText: `New order ${orderNumber}` })).toBeVisible();

  // The shop starts preparing → the customer's open order page updates within 3 s, no reload.
  // A marker on window survives client-side re-renders but not a page load.
  await customer.evaluate(() => Object.assign(window, { __noReload: true }));
  await card.getByRole("button", { name: /Payment received – start preparing/ }).click();
  await expect(progress.locator('[data-step="PREPARING"]')).toHaveAttribute("data-state", "current", LIVE);
  await expect(customer.locator("main [data-status]").filter({ visible: true }).first()).toHaveAttribute("data-status", "PREPARING", LIVE);
  await expect(customer.getByTestId("ready-estimate").filter({ visible: true })).toContainText(/Estimated ready by|Should be ready/);
  expect(await customer.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // …with a live toast and an unread count on the bell.
  await expect(customer.getByTestId("toast").filter({ hasText: "The shop has started preparing your order." })).toBeVisible();
  const bell = customer.getByRole("button", { name: /^Notifications, \d+ unread$/ });
  await expect(bell).toBeVisible();

  // Ready for pickup arrives the same way.
  await card.getByRole("button", { name: /Ready for pickup for order/ }).click();
  await expect(progress.locator('[data-step="READY_FOR_PICKUP"]')).toHaveAttribute("data-state", "current", LIVE);

  // The bell lists the updates; mark all read clears the count (and it stays cleared after a reload).
  await bell.click();
  const panel = customer.getByRole("region", { name: "Notifications panel" });
  // The newest entry is this order's (student1 also has seeded notifications with the same text).
  await expect(panel.getByRole("listitem").first()).toContainText("Your order is ready for pickup!");
  await Promise.all([
    customer.waitForResponse((r) => r.url().endsWith("/api/notifications/read") && r.ok()),
    panel.getByRole("button", { name: "Mark all read" }).click(),
  ]);
  await expect(customer.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  await customer.reload();
  await expect(customer.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  await expect(customer.getByTestId("unread-badge")).toHaveCount(0);

  await close();
});

test("a stock toggle shows up live on a customer's open menu page", async ({ browser }) => {
  const { customer, shop, close } = await twoPortals(browser);
  await customer.goto(`/shops/${CHAI.id}`);
  const dish = customer.getByRole("article", { name: "Bread Pakora" });
  await expect(dish).toHaveAttribute("data-in-stock", "true");

  await shop.goto("/shop/menu");
  const toggle = shop.getByRole("switch", { name: "Bread Pakora in stock" });
  await toggle.click();
  await expect(dish).toHaveAttribute("data-in-stock", "false", LIVE);
  await expect(customer.getByRole("button", { name: "Bread Pakora can't be added: out of stock" })).toBeDisabled();

  await toggle.click();
  await expect(dish).toHaveAttribute("data-in-stock", "true", LIVE);
  await expect(customer.getByRole("button", { name: "Add Bread Pakora to cart" })).toBeEnabled();
  await close();
});

test("a shop closing and reopening shows up live on a customer's open shops list", async ({ browser }) => {
  const { customer, shop, close } = await twoPortals(browser);
  await customer.goto("/shops");
  const card = customer.getByRole("list", { name: "Shops" }).getByRole("link", { name: new RegExp(CHAI.name) });
  await expect(card).toContainText("Open");

  await shop.goto("/shop/profile");
  const toggle = shop.getByRole("switch", { name: "Shop open for orders" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(card).toContainText("Closed", LIVE);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(card).toContainText("Open", LIVE);
  await close();
});

test("the shop's menu page follows stock changes made in another tab", async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  await logIn(first, "/shop/login", "shop1@pec.test", "shop123", /\/shop$/);
  const second = await context.newPage();
  await first.goto("/shop/menu");
  await second.goto("/shop/menu");

  await second.getByRole("switch", { name: "Masala Chai in stock" }).click();
  await expect(first.getByRole("article", { name: "Masala Chai" })).toHaveAttribute("data-in-stock", "false", LIVE);
  await second.getByRole("switch", { name: "Masala Chai in stock" }).click();
  await expect(first.getByRole("article", { name: "Masala Chai" })).toHaveAttribute("data-in-stock", "true", LIVE);
  await context.close();
});
