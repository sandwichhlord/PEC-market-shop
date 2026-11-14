import { expect, test, type Browser, type Page } from "@playwright/test";

// Seeded data (prisma/seed-data.ts): admin@pec.test / admin123; shop3 = Fresh Squeeze Juice Bar (shop3@pec.test /
// shop123) with Mosambi Juice. The reported customer signs up fresh so suspending them cannot affect other specs.
const JUICE_BAR = "seed_shop3";
const uid = () => Math.random().toString(36).slice(2, 8);

test.describe.configure({ timeout: 90_000 });

async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  // Login (bcrypt + DB) is not under test here; give it room on a loaded host.
  await expect(page).toHaveURL(landing, { timeout: 20_000 });
}

async function contextPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("a shop reports a customer; the admin suspends them from the queue and they are logged out", async ({ browser }) => {
  const customer = await contextPage(browser);
  const shop = await contextPage(browser);
  const admin = await contextPage(browser);

  // A fresh customer places and pays for an order.
  const name = `Rowdy ${uid()}`;
  const email = `rowdy-${uid()}@pec.test`;
  await customer.page.goto("/signup");
  await customer.page.getByLabel("Full name").fill(name);
  await customer.page.getByLabel("Email").fill(email);
  await customer.page.getByLabel("Password").fill("password123");
  await customer.page.getByRole("button", { name: "Create account" }).click();
  await expect(customer.page).toHaveURL(/\/shops$/, { timeout: 20_000 });
  await customer.page.goto(`/shops/${JUICE_BAR}`);
  await customer.page.getByRole("button", { name: "Add Mosambi Juice to cart" }).click();
  await customer.page.getByRole("region", { name: "Cart summary" }).getByRole("link", { name: "View cart" }).click();
  await customer.page.getByRole("button", { name: /^Pay / }).click();
  await customer.page.getByRole("button", { name: /^Pay / }).click();
  await customer.page.getByRole("link", { name: "Track your order" }).click();
  await expect(customer.page).toHaveURL(/\/orders\/[^/]+$/);
  const orderId = new URL(customer.page.url()).pathname.split("/").pop()!;

  // The shop reports them from the order page.
  await logIn(shop.page, "/shop/login", "shop3@pec.test", "shop123", /\/shop$/);
  await shop.page.goto(`/shop/orders/${orderId}`);
  await shop.page.getByRole("button", { name: "Report customer" }).click();
  const form = shop.page.getByRole("dialog", { name: `Report ${name}` });
  await form.getByRole("radio", { name: "Misbehaviour" }).check();
  await form.getByLabel("What happened?").fill("Shouted at the counter staff during pickup.");
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form).toBeHidden();
  await expect(shop.page.getByTestId("customer-report").filter({ visible: true })).toContainText("Misbehaviour");
  await expect(shop.page.getByRole("button", { name: "Report customer" })).toHaveCount(0);

  // The admin sees it in the reports queue and suspends the customer.
  await logIn(admin.page, "/admin/login", "admin@pec.test", "admin123", /\/admin$/);
  await admin.page.getByRole("link", { name: "Reports" }).first().click();
  const report = admin.page.getByTestId("report").filter({ hasText: email });
  await expect(report).toContainText("Shouted at the counter staff during pickup.");
  await expect(report).toContainText("Fresh Squeeze Juice Bar");
  await report.getByRole("button", { name: `Suspend ${name}` }).click();
  const confirm = admin.page.getByRole("dialog", { name: `Suspend ${name}` });
  await confirm.getByLabel("Admin note (optional)").fill("Second incident this week.");
  await confirm.getByRole("button", { name: "Suspend account" }).click();
  await expect(confirm).toBeHidden();

  // Actioned reports leave the open queue; the "Actioned" tab shows it with the suspended account.
  await expect(report).toHaveCount(0);
  await admin.page.getByRole("link", { name: "Actioned" }).click();
  const actioned = admin.page.getByTestId("report").filter({ hasText: email });
  await expect(actioned).toHaveAttribute("data-report-status", "ACTIONED");
  await expect(actioned.locator("[data-account-status]")).toHaveAttribute("data-account-status", "SUSPENDED");
  await expect(actioned).toContainText("Second incident this week.");

  // The customer's next request logs them out.
  await customer.page.goto("/orders");
  await expect(customer.page).toHaveURL(/\/login\?reason=suspended$/);
  await expect(customer.page.getByText(/Your account has been suspended/)).toBeVisible();

  // Reinstating from the users list lets them back in.
  await admin.page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  const row = admin.page.getByTestId("admin-user").filter({ hasText: email });
  await row.getByRole("button", { name: `Reinstate ${name}` }).click();
  await admin.page.getByRole("dialog", { name: `Reinstate ${name}` }).getByRole("button", { name: "Reinstate account" }).click();
  await expect(row.locator("[data-account-status]")).toHaveAttribute("data-account-status", "ACTIVE");
  await logIn(customer.page, "/login", email, "password123", /\/shops$/);

  await Promise.all([customer.context.close(), shop.context.close(), admin.context.close()]);
});

test("admin pages fit a 375px screen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await logIn(page, "/admin/login", "admin@pec.test", "admin123", /\/admin$/);
  for (const [path, heading] of [
    ["/admin", "Dashboard"],
    ["/admin/disputes?status=all", "Disputes"],
    ["/admin/reports?status=all", "Customer reports"],
    ["/admin/users", "Users"],
    ["/admin/shops", "Shops"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  // The seeded escalated / resolved disputes open their detail page.
  await page.goto("/admin/disputes?status=all");
  await page.getByTestId("admin-dispute").first().click();
  await expect(page.getByRole("heading", { name: "Status history" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await context.close();
});
