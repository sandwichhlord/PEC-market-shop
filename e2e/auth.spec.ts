import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { assertE2eDatabaseUrl } from "./support/e2e-db";

const uid = () => Math.random().toString(36).slice(2, 8);

/** Sets account status directly in the (guarded) e2e database; these specs test the customer side, admin.spec the admin UI. */
async function setAccountStatus(email: string, status: "WARNED" | "SUSPENDED", warningMessage: string | null = null) {
  const client = new Client({ connectionString: assertE2eDatabaseUrl(process.env.E2E_DATABASE_URL) });
  await client.connect();
  try {
    await client.query(`UPDATE "User" SET status = $1, "warningMessage" = $2 WHERE email = $3`, [status, warningMessage, email]);
  } finally {
    await client.end();
  }
}

async function signUpCustomer(page: import("@playwright/test").Page): Promise<string> {
  const email = `status-${uid()}@pec.test`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Status Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/shops$/);
  return email;
}

test("a warned customer sees a dismissible banner", async ({ page }) => {
  const email = await signUpCustomer(page);
  await setAccountStatus(email, "WARNED", "Please pick up your orders on time.");
  await page.reload();
  const banner = page.getByRole("alert").filter({ hasText: "Please pick up your orders on time." });
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "Dismiss warning" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Shops" })).toBeVisible();
  await expect(banner).toBeHidden();
});

test("a suspended customer is logged out on their next page load and cannot log back in", async ({ page }) => {
  const email = await signUpCustomer(page);
  await setAccountStatus(email, "SUSPENDED");
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?reason=suspended$/);
  await expect(page.getByText(/Your account has been suspended/)).toBeVisible();
  expect((await page.context().cookies()).find((c) => c.name === "pec_session")).toBeUndefined();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /suspended/ })).toHaveCount(2);
  await expect(page).toHaveURL(/\/login/);
});

async function logIn(page: import("@playwright/test").Page, path: string, email: string, password: string) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("customer logs in, is kept out of the shop portal, and logs out", async ({ page }) => {
  await logIn(page, "/login", "student1@pec.test", "student123");
  await expect(page).toHaveURL(/\/shops$/);
  await expect(page.getByRole("heading", { name: "Shops" })).toBeVisible();

  await page.goto("/shop");
  await expect(page).toHaveURL(/\/shops$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/shops$/);

  await page.getByRole("link", { name: "Account" }).first().click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
});

test("a deep link survives login", async ({ page }) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  await page.getByLabel("Email").fill("student2@pec.test");
  await page.getByLabel("Password").fill("student123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
});

test("wrong portal login explains and links to the right portal", async ({ page }) => {
  await logIn(page, "/login", "shop1@pec.test", "shop123");
  await expect(page.getByText("This account is a shop owner account.")).toBeVisible();
  await page.getByRole("link", { name: "Go to the right login page" }).click();
  await expect(page).toHaveURL(/\/shop\/login$/);
});

test("shop owner and admin land in their sidebar portals", async ({ page }) => {
  await logIn(page, "/shop/login", "shop1@pec.test", "shop123");
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Portal" })).toBeVisible();
  await page.goto("/shops");
  await expect(page).toHaveURL(/\/shop$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/shop\/login$/);

  await logIn(page, "/admin/login", "admin@pec.test", "admin123");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Open reports")).toBeVisible();
});

test("customer signs up and lands on the shops list", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("New Student");
  await page.getByLabel("Email").fill(`new-${uid()}@pec.test`);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/shops$/);
});

test("shop owner signs up with a logo and sees their shop", async ({ page }) => {
  await page.goto("/shop/signup");
  await page.getByLabel("Your name").fill("New Owner");
  await page.getByLabel("Email").fill(`owner-${uid()}@pec.test`);
  await page.getByLabel("Password").fill("password123");
  await page.getByLabel("Shop name").fill("Maggi Point");
  await page.getByLabel("Location in the market").fill("Stall 12, near the library");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.getByLabel("Logo (optional)").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Register shop" }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("heading", { name: "Maggi Point" })).toBeVisible();
  const logo = page.getByRole("img", { name: "Maggi Point logo" });
  await expect(logo).toHaveAttribute("src", /\/api\/uploads\/logos\/.+\.png$/);
  const res = await page.request.get((await logo.getAttribute("src"))!);
  expect(res.headers()["content-type"]).toBe("image/png");
});

test("mobile customer shell has a bottom tab bar", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 740 } });
  const page = await context.newPage();
  await logIn(page, "/login", "student1@pec.test", "student123");
  await expect(page).toHaveURL(/\/shops$/);
  const tabs = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(tabs).toHaveCount(1);
  for (const name of ["Shops", "Orders", "Notifications", "Account"]) {
    await expect(tabs.getByRole("link", { name })).toBeVisible();
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
  await context.close();
});

test("seed images are served", async ({ request }) => {
  const res = await request.get("/api/uploads/seed/shop1-logo.svg");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/svg+xml");
});
