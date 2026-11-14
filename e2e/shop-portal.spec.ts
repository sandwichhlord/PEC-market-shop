import { expect, test, type Page } from "@playwright/test";

// Seeded data (prisma/seed-data.ts): shop2 (Dakshin Dosa Corner) has PEC1007 waiting in PLACED_PAID;
// shop4 is Campus Bites Fast Food. Passwords: shop123 / student123.
const FAST_FOOD = { id: "seed_shop4", name: "Campus Bites Fast Food" };

async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(landing);
}

const logInShop = (page: Page, n: number) => logIn(page, "/shop/login", `shop${n}@pec.test`, "shop123", /\/shop$/);

test("shop works a paid order through the kitchen: preparing → ready → completed", async ({ page }) => {
  await logInShop(page, 2);
  await page.getByRole("link", { name: "Orders" }).first().click();
  await expect(page).toHaveURL(/\/shop\/orders$/);

  const card = page.getByRole("article", { name: "Order PEC1007" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Simran Kaur");
  await expect(card).toContainText("Idli Sambar");
  await expect(card).toContainText("Paid online");
  await expect(card.locator("[data-status]").first()).toHaveAttribute("data-status", "PLACED_PAID");

  await card.getByRole("button", { name: /Payment received – start preparing/ }).click();
  await expect(card.getByText("Preparing", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: /Ready for pickup for order/ }).click();
  await expect(card.getByText("Ready for pickup", { exact: true })).toBeVisible();

  // Finish from the order detail page, which shows the timeline.
  await card.getByRole("link", { name: /PEC1007/ }).click();
  await expect(page.getByRole("heading", { name: "Order #PEC1007" })).toBeVisible();
  await page.getByRole("button", { name: /Mark completed/ }).click();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  const timeline = page.getByRole("region", { name: "Timeline" });
  for (const step of ["Placed & paid", "Preparing", "Ready for pickup", "Completed"]) {
    await expect(timeline.getByText(step, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Mark completed/ })).toHaveCount(0);

  await page.goto("/shop/orders?filter=completed");
  await expect(page.getByRole("article", { name: "Order PEC1007" })).toBeVisible();
  await page.goto("/shop/orders");
  await expect(page.getByRole("article", { name: "Order PEC1007" })).toHaveCount(0);
});

test("shop adds a dish with a photo, toggles stock, edits and deletes it; customers see the changes", async ({ page, browser }) => {
  await logInShop(page, 4);
  await page.goto("/shop/menu");
  const dishName = `Test Momos ${Math.random().toString(36).slice(2, 6)}`;

  await page.getByRole("button", { name: "Add dish" }).click();
  const sheet = page.getByRole("dialog", { name: "Add dish" });
  await sheet.getByLabel("Dish name").fill(dishName);
  await sheet.getByLabel("Description (optional)").fill("Steamed, with red chutney.");
  await sheet.getByLabel("Price (₹)").fill("65.50");
  await sheet.getByLabel("Prep time (min)").fill("12");
  // 1×1 transparent PNG.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await sheet.getByLabel(/Photo/).setInputFiles({ name: "momos.png", mimeType: "image/png", buffer: png });
  await sheet.getByRole("button", { name: "Add dish" }).click();
  await expect(page.getByText(`${dishName} added to the menu.`)).toBeVisible();

  const row = page.getByRole("article", { name: dishName });
  await expect(row).toContainText("₹65.50");
  // The photo is decorative (alt=""), so it has no img role.
  await expect(row.locator("img")).toHaveAttribute("src", /\/api\/uploads\/menu\//);

  // The customer sees it, in stock.
  const customer = await browser.newContext();
  const customerPage = await customer.newPage();
  await logIn(customerPage, "/login", "student1@pec.test", "student123", /\/shops$/);
  await customerPage.goto(`/shops/${FAST_FOOD.id}`);
  await expect(customerPage.getByRole("article", { name: dishName })).toHaveAttribute("data-in-stock", "true");

  // Out of stock → the customer can no longer add it.
  // The switch flips optimistically; wait for the server before reloading.
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/stock") && r.request().method() === "PATCH" && r.ok()),
    row.getByRole("switch", { name: `${dishName} in stock` }).click(),
  ]);
  await expect(row).toHaveAttribute("data-in-stock", "false");
  await expect(row).toContainText("Out of stock");
  await page.reload();
  await expect(page.getByRole("article", { name: dishName })).toHaveAttribute("data-in-stock", "false");
  await customerPage.reload();
  await expect(customerPage.getByRole("button", { name: `${dishName} can't be added: out of stock` })).toBeDisabled();

  // Edit the price.
  await page.getByRole("button", { name: `Edit ${dishName}` }).click();
  const editSheet = page.getByRole("dialog", { name: "Edit dish" });
  await expect(editSheet.getByLabel("Price (₹)")).toHaveValue("65.50");
  await editSheet.getByLabel("Price (₹)").fill("70");
  await editSheet.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("article", { name: dishName })).toContainText("₹70");

  // Delete it (never ordered → removed outright).
  await page.getByRole("button", { name: `Delete ${dishName}` }).click();
  await page.getByRole("dialog", { name: "Delete dish" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`${dishName} deleted.`)).toBeVisible();
  await expect(page.getByRole("article", { name: dishName })).toHaveCount(0);
  await customerPage.reload();
  await expect(customerPage.getByRole("article", { name: dishName })).toHaveCount(0);
  await customer.close();
});

test("shop edits its profile and closes / reopens", async ({ page }) => {
  await logInShop(page, 4);
  await page.getByRole("link", { name: "Shop profile" }).first().click();
  await expect(page).toHaveURL(/\/shop\/profile$/);

  await page.getByLabel("Location in the market").fill("Stall 9, behind the library");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Shop profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Location in the market")).toHaveValue("Stall 9, behind the library");

  const toggle = page.getByRole("switch", { name: "Shop open for orders" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/shops/${FAST_FOOD.id}`) && r.request().method() === "PATCH" && r.ok()),
    toggle.click(),
  ]);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Shop open for orders" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: "Shop open for orders" }).click();
  await expect(page.getByRole("switch", { name: "Shop open for orders" })).toHaveAttribute("aria-checked", "true");
});

test("shop orders and menu pages fit a 375px screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logInShop(page, 1);
  for (const path of ["/shop/orders?filter=completed", "/shop/menu", "/shop/profile"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `${path} must not scroll horizontally`).toBeLessThanOrEqual(clientWidth);
  }
});

test("a shop owner cannot open another shop's order", async ({ page }) => {
  await logInShop(page, 1);
  // Owner of shop1 calling shop2's owner-only APIs.
  const res = await page.request.get("/api/shops/seed_shop2/orders");
  expect(res.status()).toBe(403);
  const menu = await page.request.post("/api/shops/seed_shop2/menu", { multipart: { name: "Hack", pricePaise: "100", prepTimeMinutes: "1" } });
  expect(menu.status()).toBe(403);
});
