import { expect, test, type Page } from "@playwright/test";

// Seeded data (prisma/seed-data.ts): shop1 = seed_shop1 (shop1@pec.test / shop123) with Masala Chai; its two seeded
// reviews are 5★ and 4★ (average 4.5). student2 / student123 (student1's history counts belong to orders.spec.ts).
const CHAI_SHOP = "seed_shop1";

test.describe.configure({ timeout: 60_000 });

async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  // Login (bcrypt + DB) is not under test here; give it room on a loaded host.
  await expect(page).toHaveURL(landing, { timeout: 20_000 });
}

const badge = (page: Page) => page.locator("main [data-status]").filter({ visible: true }).first();

// Smallest PNG header; the server sniffs the type from these bytes.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(24).fill(0)]);

test("a completed order can be reviewed once; the shop page shows it with the new average", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const shopContext = await browser.newContext();
  const customer = await customerContext.newPage();
  const shop = await shopContext.newPage();
  await logIn(customer, "/login", "student2@pec.test", "student123", /\/shops$/);
  await logIn(shop, "/shop/login", "shop1@pec.test", "shop123", /\/shop$/);

  await customer.goto(`/shops/${CHAI_SHOP}`);
  await expect(customer.getByTestId("shop-average").filter({ visible: true })).toContainText("4.5 out of 5 · 2 reviews");
  await customer.getByRole("button", { name: "Add Masala Chai to cart" }).click();
  await customer.getByRole("region", { name: "Cart summary" }).getByRole("link", { name: "View cart" }).click();
  await customer.getByRole("button", { name: /^Pay / }).click();
  await customer.getByRole("button", { name: /^Pay / }).click();
  await customer.getByRole("link", { name: "Track your order" }).click();
  await expect(customer).toHaveURL(/\/orders\/[^/]+$/);
  const orderId = new URL(customer.url()).pathname.split("/").pop()!;

  // No review form before the order is completed.
  await expect(customer.getByRole("form", { name: "Review this order" })).toHaveCount(0);

  await shop.goto(`/shop/orders/${orderId}`);
  for (const action of [/start preparing/, /^Ready for pickup/, /^Mark completed/]) {
    await shop.getByRole("button", { name: action }).click();
  }
  await expect(badge(customer)).toHaveAttribute("data-status", "COMPLETED", { timeout: 5000 });

  // The form appears live; submitting without stars is refused client-side.
  const form = customer.getByRole("form", { name: "Review this order" });
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Post review" }).click();
  await expect(form.getByText("Choose a star rating.")).toBeVisible();

  await form.getByRole("radio", { name: /^3 stars/ }).check({ force: true });
  await form.getByLabel("Comments (optional)").fill("Chai was good but a bit too sweet.");
  await form.getByTestId("review-photos").setInputFiles({ name: "chai.png", mimeType: "image/png", buffer: PNG });
  await expect(form.getByRole("img", { name: "Photo 1 preview" })).toBeVisible();
  await form.getByRole("button", { name: "Post review" }).click();

  const mine = customer.getByRole("region", { name: "Your review" });
  await expect(mine).toContainText("Chai was good but a bit too sweet.");
  await expect(mine.getByRole("img", { name: "3 out of 5 stars" })).toBeVisible();
  await expect(mine.getByRole("img", { name: "Review photo 1" })).toBeVisible();
  await expect(customer.getByRole("form", { name: "Review this order" })).toHaveCount(0);

  // The shop's order page picks it up live.
  await expect(shop.getByRole("region", { name: "Customer review" })).toContainText("Chai was good but a bit too sweet.", { timeout: 5000 });

  // Shop page: newest review first, average (5 + 4 + 3) / 3 = 4.0.
  await customer.goto(`/shops/${CHAI_SHOP}`);
  await expect(customer.getByTestId("shop-average").filter({ visible: true })).toContainText("4.0 out of 5 · 3 reviews");
  await expect(customer.getByTestId("review").filter({ visible: true }).first()).toContainText("Chai was good but a bit too sweet.");

  await Promise.all([customerContext.close(), shopContext.close()]);
});
