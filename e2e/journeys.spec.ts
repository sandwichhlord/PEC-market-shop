import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

// P12 end-to-end journeys (mock payments, fresh pec_market_e2e database). Each journey signs up its own customer so
// it never depends on, or disturbs, the seeded accounts other specs assert on.
// Seeded data (prisma/seed-data.ts): shop4 = Gyoza Cafe (shop4@pec.test / shop123): Aloo Tikki Burger ₹60,
// French Fries ₹70. admin@pec.test / admin123. Shop 2 is Paratha Cafe (shop2@pec.test).
const CAMPUS_BITES = { id: "seed_shop4", name: "Gyoza Cafe", email: "shop4@pec.test" };
const uid = () => Math.random().toString(36).slice(2, 8);

// Journeys drive two or three signed-in contexts through checkout and beyond.
test.describe.configure({ timeout: 120_000 });

/** Login and signup are bcrypt + DB round trips; give them room on a loaded host. */
const AUTH_TIMEOUT = 20_000;
/** Page loads and form submits are server round trips (render + DB); allow for a loaded host. */
const SERVER_TIMEOUT = 15_000;
/**
 * Live (Socket.IO) updates must arrive without a reload. Tests first wait for the acting side to show its own change
 * (SERVER_TIMEOUT), so this budget measures only the push to the other side.
 */
const LIVE_TIMEOUT = 5_000;

async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(landing, { timeout: AUTH_TIMEOUT });
}

async function newPage(browser: Browser, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  return { context, page: await context.newPage() };
}

/** Signs a brand-new customer up through the UI; returns their name and email. */
async function signUp(page: Page, prefix = "student") {
  const name = `Journey ${uid()}`;
  const email = `${prefix}-${uid()}@pec.test`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/shops$/, { timeout: AUTH_TIMEOUT });
  return { name, email };
}

/** From the shops list: open Gyoza Cafe (shop 4), add the given dishes, go to the cart. */
async function fillCart(page: Page, dishes: string[]) {
  await page.goto("/shops");
  await page.getByRole("list", { name: "Shops" }).getByRole("link", { name: new RegExp(CAMPUS_BITES.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/shops/${CAMPUS_BITES.id}$`), { timeout: SERVER_TIMEOUT });
  for (const dish of dishes) await page.getByRole("button", { name: `Add ${dish} to cart` }).click();
  const summary = page.getByRole("region", { name: "Cart summary" });
  await expect(summary).toContainText(`${dishes.length} item`);
  await summary.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/cart$/, { timeout: SERVER_TIMEOUT });
}

/** Cart → mock pay page → pay → order page. Returns the order id and number. */
async function payAndTrack(page: Page) {
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//, { timeout: SERVER_TIMEOUT });
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible({ timeout: SERVER_TIMEOUT });
  await page.getByRole("link", { name: "Track your order" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/, { timeout: SERVER_TIMEOUT });
  const orderId = new URL(page.url()).pathname.split("/").pop()!;
  const heading = await page.getByRole("heading", { level: 1, name: /^Order #PEC/ }).filter({ visible: true }).textContent();
  return { orderId, orderNumber: heading!.replace("Order #", "").trim() };
}

const badge = (page: Page) => page.locator("main [data-status]").filter({ visible: true }).first();
const disputes = (page: Page) => page.getByTestId("dispute").filter({ visible: true });

async function noSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${where} scrolls sideways`).toBeLessThanOrEqual(0);
}

const closeAll = (...contexts: BrowserContext[]) => Promise.all(contexts.map((c) => c.close()));

test("1 · golden path: sign up → order → pay → live status → complete → review", async ({ browser }) => {
  const customer = await newPage(browser);
  const shop = await newPage(browser);

  const { name } = await signUp(customer.page);
  await fillCart(customer.page, ["Aloo Tikki Burger", "French Fries"]);
  await expect(customer.page.getByRole("region", { name: "Cart items" }).getByRole("listitem")).toHaveCount(2);
  const { orderId, orderNumber } = await payAndTrack(customer.page);
  await expect(badge(customer.page)).toHaveAttribute("data-status", "PLACED_PAID");

  // The shop finds the new order on its dashboard and works it through the kitchen from the order card.
  await logIn(shop.page, "/shop/login", CAMPUS_BITES.email, "shop123", /\/shop$/);
  await shop.page.goto("/shop/orders");
  const card = shop.page.getByRole("article", { name: `Order ${orderNumber}` });
  await expect(card).toContainText(name);
  await expect(card).toContainText("Aloo Tikki Burger");

  await card.getByRole("button", { name: /start preparing/ }).click();
  await expect(card.getByText("Preparing", { exact: true })).toBeVisible({ timeout: SERVER_TIMEOUT });
  await expect(badge(customer.page)).toHaveAttribute("data-status", "PREPARING", { timeout: LIVE_TIMEOUT });
  await expect(customer.page.getByTestId("toast").first()).toBeVisible();

  await card.getByRole("button", { name: /^Ready for pickup/ }).click();
  await expect(card.getByText("Ready for pickup", { exact: true })).toBeVisible({ timeout: SERVER_TIMEOUT });
  await expect(badge(customer.page)).toHaveAttribute("data-status", "READY_FOR_PICKUP", { timeout: LIVE_TIMEOUT });

  await shop.page.goto(`/shop/orders/${orderId}`);
  await shop.page.getByRole("button", { name: /^Mark completed/ }).click();
  await expect(badge(shop.page)).toHaveAttribute("data-status", "COMPLETED", { timeout: SERVER_TIMEOUT });
  await expect(badge(customer.page)).toHaveAttribute("data-status", "COMPLETED", { timeout: LIVE_TIMEOUT });

  // Review appears live once completed.
  const form = customer.page.getByRole("form", { name: "Review this order" });
  await expect(form).toBeVisible();
  await form.getByRole("radio", { name: /^5 stars/ }).check({ force: true });
  const comment = `Great burger ${uid()}`;
  await form.getByLabel("Comments (optional)").fill(comment);
  await form.getByRole("button", { name: "Post review" }).click();
  await expect(customer.page.getByRole("region", { name: "Your review" })).toContainText(comment, { timeout: SERVER_TIMEOUT });

  // The shop's page lists it, and the order sits under Past.
  await customer.page.goto(`/shops/${CAMPUS_BITES.id}`);
  await expect(customer.page.getByTestId("review").filter({ visible: true }).first()).toContainText(comment);
  await customer.page.goto("/orders?tab=past");
  await expect(customer.page.getByText(`#${orderNumber}`).filter({ visible: true })).toBeVisible();

  await closeAll(customer.context, shop.context);
});

test("2 · payment fails, the cart is kept, and a retry goes through", async ({ browser }) => {
  const customer = await newPage(browser);
  await signUp(customer.page);
  await fillCart(customer.page, ["French Fries"]);

  await customer.page.getByRole("button", { name: /^Pay / }).click();
  await expect(customer.page).toHaveURL(/\/pay\/mock\//, { timeout: SERVER_TIMEOUT });
  await customer.page.getByRole("button", { name: "Fail payment" }).click();
  await expect(customer.page).toHaveURL(/\/checkout\/cancel\?orderId=/, { timeout: SERVER_TIMEOUT });
  await expect(customer.page.getByRole("heading", { name: "Payment cancelled" })).toBeVisible();

  await customer.page.getByRole("link", { name: "Back to cart" }).click();
  await expect(customer.page.getByRole("region", { name: "Cart items" }).getByRole("listitem")).toHaveCount(1);

  const { orderNumber } = await payAndTrack(customer.page);
  await expect(badge(customer.page)).toHaveAttribute("data-status", "PLACED_PAID");

  // History: the paid retry is active; the failed attempt is in Past as PAYMENT_FAILED.
  await customer.page.goto("/orders");
  await expect(customer.page.getByText(`#${orderNumber}`).filter({ visible: true })).toBeVisible();
  await customer.page.goto("/orders?tab=past");
  await expect(customer.page.locator('main [data-status="PAYMENT_FAILED"]').filter({ visible: true })).toHaveCount(1);
  await closeAll(customer.context);
});

test("3 · refund request → shop approves → the customer sees REFUNDED live", async ({ browser }) => {
  const customer = await newPage(browser);
  const shop = await newPage(browser);
  await signUp(customer.page);
  await fillCart(customer.page, ["Aloo Tikki Burger", "French Fries"]);
  const { orderId } = await payAndTrack(customer.page);

  await customer.page.getByRole("button", { name: "Request a refund" }).click();
  const sheet = customer.page.getByRole("dialog", { name: "Request a refund" });
  await sheet.getByRole("checkbox", { name: "Whole order" }).check();
  await expect(sheet.getByTestId("refund-amount")).toHaveText("₹130");
  await sheet.getByLabel("Reason").fill("Ordered by mistake");
  await sheet.getByRole("button", { name: "Request ₹130 refund" }).click();
  await expect(badge(customer.page)).toHaveAttribute("data-status", "REFUND_REQUESTED");

  await logIn(shop.page, "/shop/login", CAMPUS_BITES.email, "shop123", /\/shop$/);
  await shop.page.goto(`/shop/orders/${orderId}`);
  const request = disputes(shop.page).first();
  await expect(request).toContainText("Ordered by mistake");
  await request.getByRole("button", { name: "Approve refund (₹130)" }).click();
  await expect(disputes(shop.page).first()).toHaveAttribute("data-dispute-status", "RESOLVED", { timeout: SERVER_TIMEOUT });

  // No reload on the customer's side.
  await expect(badge(customer.page)).toHaveAttribute("data-status", "REFUNDED", { timeout: LIVE_TIMEOUT });
  await expect(customer.page.getByText("Refunded", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(customer.page.getByRole("button", { name: "Request a refund" })).toHaveCount(0);
  await closeAll(customer.context, shop.context);
});

test("4 · shop rejects a refund → admin force-refunds it", async ({ browser }) => {
  const customer = await newPage(browser);
  const shop = await newPage(browser);
  const admin = await newPage(browser);
  await signUp(customer.page);
  await fillCart(customer.page, ["Aloo Tikki Burger"]);
  const { orderId, orderNumber } = await payAndTrack(customer.page);

  await customer.page.getByRole("button", { name: "Request a refund" }).click();
  const sheet = customer.page.getByRole("dialog", { name: "Request a refund" });
  await sheet.getByRole("checkbox", { name: "Whole order" }).check();
  await sheet.getByLabel("Reason").fill("Burger was cold");
  await sheet.getByRole("button", { name: "Request ₹60 refund" }).click();
  await expect(badge(customer.page)).toHaveAttribute("data-status", "REFUND_REQUESTED");

  await logIn(shop.page, "/shop/login", CAMPUS_BITES.email, "shop123", /\/shop$/);
  await shop.page.goto(`/shop/orders/${orderId}`);
  const request = disputes(shop.page).first();
  await request.getByRole("button", { name: "Reject" }).click();
  await request.getByLabel(/Reason for rejecting/).fill("It was served hot");
  await request.getByRole("button", { name: "Reject refund" }).click();
  await expect(disputes(shop.page).first()).toHaveAttribute("data-dispute-status", "ESCALATED", { timeout: SERVER_TIMEOUT });
  await expect(disputes(customer.page).first()).toContainText("With the market admin", { timeout: LIVE_TIMEOUT });

  // The admin finds it in the "needs action" queue and refunds everything.
  await logIn(admin.page, "/admin/login", "admin@pec.test", "admin123", /\/admin$/);
  await admin.page.goto("/admin/disputes");
  const row = admin.page.getByTestId("admin-dispute").filter({ hasText: orderNumber, visible: true });
  await expect(row).toHaveAttribute("data-dispute-status", "ESCALATED");
  await row.click();
  await admin.page.getByRole("button", { name: "Force refund" }).click();
  const refund = admin.page.getByRole("dialog", { name: "Force refund" });
  await expect(refund.getByTestId("admin-refund-amount")).toHaveText("₹60");
  await refund.getByLabel("Note to the customer and the shop").fill("Refunding as a goodwill gesture.");
  await refund.getByRole("button", { name: "Refund ₹60" }).click();
  await expect(refund).toBeHidden({ timeout: SERVER_TIMEOUT });
  await expect(admin.page.getByTestId("dispute-status").filter({ visible: true })).toHaveAttribute("data-dispute-status", "RESOLVED");

  // Both sides follow live.
  await expect(badge(customer.page)).toHaveAttribute("data-status", "REFUNDED", { timeout: LIVE_TIMEOUT });
  await expect(badge(shop.page)).toHaveAttribute("data-status", "REFUNDED", { timeout: LIVE_TIMEOUT });
  await closeAll(customer.context, shop.context, admin.context);
});

test("5 · shop reports a customer → admin suspends → the customer is blocked", async ({ browser }) => {
  const customer = await newPage(browser);
  const shop = await newPage(browser);
  const admin = await newPage(browser);
  const { name, email } = await signUp(customer.page, "reported");
  await fillCart(customer.page, ["French Fries"]);
  const { orderId } = await payAndTrack(customer.page);

  await logIn(shop.page, "/shop/login", CAMPUS_BITES.email, "shop123", /\/shop$/);
  await shop.page.goto(`/shop/orders/${orderId}`);
  await shop.page.getByRole("button", { name: "Report customer" }).click();
  const form = shop.page.getByRole("dialog", { name: `Report ${name}` });
  await form.getByRole("radio", { name: "Did not pick up the order" }).check();
  await form.getByLabel("What happened?").fill("Never came to pick up the order.");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form).toBeHidden();

  await logIn(admin.page, "/admin/login", "admin@pec.test", "admin123", /\/admin$/);
  await admin.page.goto("/admin/reports");
  const report = admin.page.getByTestId("report").filter({ hasText: email, visible: true });
  await expect(report).toContainText("Never came to pick up the order.");
  await report.getByRole("button", { name: `Suspend ${name}` }).click();
  await admin.page.getByRole("dialog", { name: `Suspend ${name}` }).getByRole("button", { name: "Suspend account" }).click();
  await expect(report).toHaveCount(0);

  // Blocked everywhere: the next page load logs them out, the API refuses the old session, and login is refused.
  const staleCookies = await customer.context.cookies();
  await customer.page.goto("/shops");
  await expect(customer.page).toHaveURL(/\/login\?reason=suspended$/);
  const api = await browser.newContext({ storageState: { cookies: staleCookies, origins: [] } });
  const me = await api.request.get("/api/me");
  expect(me.status()).toBe(403);
  expect((await me.json()).error.code).toBe("ACCOUNT_SUSPENDED");
  await api.close();

  await customer.page.getByLabel("Email").fill(email);
  await customer.page.getByLabel("Password").fill("password123");
  await customer.page.getByRole("button", { name: "Log in" }).click();
  await expect(customer.page.getByRole("alert").filter({ hasText: /suspended/ }).first()).toBeVisible();
  await expect(customer.page).toHaveURL(/\/login/);
  await closeAll(customer.context, shop.context, admin.context);
});

test("6 · role-gating across the three portals (pages and APIs)", async ({ browser }) => {
  // Signed out: each portal sends you to its own login page and remembers where you were going.
  const anon = await newPage(browser);
  for (const [path, login] of [
    ["/orders", "/login"],
    ["/cart", "/login"],
    ["/shop/orders", "/shop/login"],
    ["/admin/disputes", "/admin/login"],
  ] as const) {
    await anon.page.goto(path);
    await expect(anon.page).toHaveURL(new RegExp(`${login.replace(/\//g, "\\/")}\\?next=${encodeURIComponent(path)}$`));
  }
  expect((await anon.page.request.get("/api/me")).status()).toBe(401);
  expect((await anon.page.request.get("/api/admin/stats")).status()).toBe(401);
  await anon.context.close();

  const portals = [
    { email: "student1@pec.test", password: "student123", login: "/login", home: "/shops", blocked: ["/shop", "/shop/menu", "/admin", "/admin/users"] },
    { email: CAMPUS_BITES.email, password: "shop123", login: "/shop/login", home: "/shop", blocked: ["/shops", "/orders", "/cart", "/admin"] },
    { email: "admin@pec.test", password: "admin123", login: "/admin/login", home: "/admin", blocked: ["/shops", "/orders", "/shop", "/shop/orders"] },
  ];
  for (const p of portals) {
    const { context, page } = await newPage(browser);
    await logIn(page, p.login, p.email, p.password, new RegExp(`${p.home}$`));
    for (const path of p.blocked) {
      await page.goto(path);
      await expect(page, `${p.email} → ${path}`).toHaveURL(new RegExp(`${p.home}$`));
    }
    // Auth pages bounce a signed-in user to their own portal.
    await page.goto("/admin/login");
    await expect(page).toHaveURL(new RegExp(`${p.home}$`));
    await context.close();
  }

  // APIs answer 403 to the wrong role.
  const customer = await newPage(browser);
  await logIn(customer.page, "/login", "student1@pec.test", "student123", /\/shops$/);
  for (const path of ["/api/admin/stats", "/api/admin/users", `/api/shops/${CAMPUS_BITES.id}/orders`, `/api/shops/${CAMPUS_BITES.id}/menu`]) {
    expect((await customer.page.request.get(path)).status(), path).toBe(403);
  }
  const shop = await newPage(browser);
  await logIn(shop.page, "/shop/login", CAMPUS_BITES.email, "shop123", /\/shop$/);
  expect((await shop.page.request.get("/api/admin/stats")).status()).toBe(403);
  expect((await shop.page.request.get("/api/orders")).status()).toBe(403);
  expect((await shop.page.request.get("/api/shops/seed_shop1/orders")).status()).toBe(403);
  const checkout = await shop.page.request.post("/api/checkout", {
    data: { shopId: CAMPUS_BITES.id, items: [{ menuItemId: "x", quantity: 1, pricePaise: 6000 }] },
  });
  expect(checkout.status()).toBe(403);
  await closeAll(customer.context, shop.context);
});

test("7 · mobile (375px) golden path", async ({ browser }) => {
  const mobile = { width: 375, height: 812 };
  const customer = await newPage(browser, mobile);
  const shop = await newPage(browser);

  await signUp(customer.page, "mobile");
  await noSidewaysScroll(customer.page, "/shops");
  const tabs = customer.page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(tabs).toBeVisible();

  await fillCart(customer.page, ["Aloo Tikki Burger"]);
  await noSidewaysScroll(customer.page, "/cart");
  await customer.page.getByRole("button", { name: /^Pay / }).click();
  await expect(customer.page).toHaveURL(/\/pay\/mock\//, { timeout: SERVER_TIMEOUT });
  await noSidewaysScroll(customer.page, "mock pay page");
  await customer.page.getByRole("button", { name: /^Pay / }).click();
  await customer.page.getByRole("link", { name: "Track your order" }).click({ timeout: SERVER_TIMEOUT });
  await expect(customer.page).toHaveURL(/\/orders\/[^/]+$/, { timeout: SERVER_TIMEOUT });
  const orderId = new URL(customer.page.url()).pathname.split("/").pop()!;
  await noSidewaysScroll(customer.page, "order page");

  await logIn(shop.page, "/shop/login", CAMPUS_BITES.email, "shop123", /\/shop$/);
  await shop.page.goto(`/shop/orders/${orderId}`);
  for (const [action, status] of [
    [/start preparing/, "PREPARING"],
    [/^Ready for pickup/, "READY_FOR_PICKUP"],
    [/^Mark completed/, "COMPLETED"],
  ] as const) {
    await shop.page.getByRole("button", { name: action }).click();
    await expect(badge(shop.page)).toHaveAttribute("data-status", status, { timeout: SERVER_TIMEOUT });
    await expect(badge(customer.page)).toHaveAttribute("data-status", status, { timeout: LIVE_TIMEOUT });
  }

  const form = customer.page.getByRole("form", { name: "Review this order" });
  await form.getByRole("radio", { name: /^4 stars/ }).check({ force: true });
  await form.getByRole("button", { name: "Post review" }).click();
  await expect(customer.page.getByRole("region", { name: "Your review" })).toBeVisible({ timeout: SERVER_TIMEOUT });
  await noSidewaysScroll(customer.page, "order page with review");

  // The bottom tabs reach Orders and Notifications.
  await tabs.getByRole("link", { name: "Orders" }).click();
  await expect(customer.page).toHaveURL(/\/orders/);
  await noSidewaysScroll(customer.page, "/orders");
  await tabs.getByRole("link", { name: "Notifications" }).click();
  await expect(customer.page).toHaveURL(/\/notifications$/);
  await expect(customer.page.getByText(/ready for pickup/i).first()).toBeVisible();
  await noSidewaysScroll(customer.page, "/notifications");
  await closeAll(customer.context, shop.context);
});
