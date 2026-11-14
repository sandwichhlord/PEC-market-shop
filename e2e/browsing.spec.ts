import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Client } from "pg";
import { assertE2eDatabaseUrl } from "./support/e2e-db";

// Seeded data (prisma/seed-data.ts): student1 / student123; Chai Point Stall has "Kachori" out of stock.
const CHAI_SHOP = { id: "seed_shop1", name: "Chai Point Stall" };
const DOSA_SHOP = { id: "seed_shop2", name: "Dakshin Dosa Corner" };
const SEEDED_SHOPS = ["Chai Point Stall", "Dakshin Dosa Corner", "Fresh Squeeze Juice Bar", "Campus Bites Fast Food"];

const WIDTHS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

async function logInAsStudent(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("student1@pec.test");
  await page.getByLabel("Password").fill("student123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/shops$/);
}

/** No horizontal scrolling, and every item of `list` lies fully inside the viewport horizontally. */
async function expectNoLayoutBreakage(page: Page, list: Locator, width: number) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page must not scroll horizontally").toBeLessThanOrEqual(clientWidth);
  const boxes = await list.locator(":scope > li").evaluateAll((items) =>
    items.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);
    expect(box.width).toBeGreaterThan(200);
  }
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

async function setShopOpen(shopId: string, isOpen: boolean) {
  const client = new Client({ connectionString: assertE2eDatabaseUrl(process.env.E2E_DATABASE_URL) });
  await client.connect();
  try {
    await client.query(`UPDATE "Shop" SET "isOpen" = $1 WHERE id = $2`, [isOpen, shopId]);
  } finally {
    await client.end();
  }
}

for (const viewport of WIDTHS) {
  test.describe(`browsing at ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("shops list and shop menu render seeded data without layout breakage", async ({ page }, testInfo) => {
      await logInAsStudent(page);

      const shops = page.getByRole("list", { name: "Shops" });
      for (const name of SEEDED_SHOPS) await expect(shops.getByRole("heading", { name })).toBeVisible();
      await expect(shops.getByText("Open").first()).toBeVisible();
      await expect(shops.getByLabel(/^Rated \d\.\d out of 5/).first()).toBeVisible();
      await expectNoLayoutBreakage(page, shops, viewport.width);
      await attachScreenshot(page, testInfo, `shops-${viewport.name}.png`);

      await shops.getByRole("link", { name: new RegExp(CHAI_SHOP.name) }).click();
      await expect(page).toHaveURL(new RegExp(`/shops/${CHAI_SHOP.id}$`));
      await expect(page.getByRole("heading", { level: 1, name: CHAI_SHOP.name })).toBeVisible();

      const menu = page.getByRole("list", { name: "Menu" });
      const chai = menu.getByRole("article", { name: "Masala Chai" });
      await expect(chai).toBeVisible();
      await expect(chai.getByText("₹")).toBeVisible();
      await expect(chai.getByText(/~\d+ min/)).toBeVisible();
      await expect(chai.locator("img")).toBeVisible();
      await expect(menu.getByRole("article", { name: "Kachori" }).getByText("Out of stock")).toBeVisible();
      await expectNoLayoutBreakage(page, menu, viewport.width);
      await attachScreenshot(page, testInfo, `menu-${viewport.name}.png`);

      await chai.getByRole("button", { name: "View details for Masala Chai" }).click();
      const sheet = page.getByRole("dialog", { name: "Masala Chai" });
      await expect(sheet.getByRole("heading", { name: "Masala Chai" })).toBeVisible();
      await expect(sheet.getByText("In stock")).toBeVisible();
      const sheetBox = await sheet.boundingBox();
      expect(sheetBox).not.toBeNull();
      expect(sheetBox!.x).toBeGreaterThanOrEqual(0);
      expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(viewport.width);
      await attachScreenshot(page, testInfo, `dish-sheet-${viewport.name}.png`);
    });
  });
}

test("out-of-stock dishes are visible but cannot be added", async ({ page }) => {
  await logInAsStudent(page);
  await page.goto(`/shops/${CHAI_SHOP.id}`);
  const kachori = page.getByRole("article", { name: "Kachori" });
  await expect(kachori).toBeVisible();
  await expect(kachori.getByRole("button", { name: "Kachori can't be added: out of stock" })).toBeDisabled();

  await kachori.getByRole("button", { name: "View details for Kachori" }).click();
  const sheet = page.getByRole("dialog", { name: "Kachori" });
  await expect(sheet.getByRole("button", { name: "Out of stock" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: /Add to cart/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("region", { name: "Cart summary" })).toHaveCount(0);

  // An in-stock dish can be added, with a quantity from the detail sheet.
  await page.getByRole("button", { name: "Add Masala Chai to cart" }).click();
  await expect(page.getByRole("region", { name: "Cart summary" })).toContainText("1 item");
  await page.getByRole("button", { name: "View details for Bun Maska" }).click();
  const bun = page.getByRole("dialog", { name: "Bun Maska" });
  await bun.getByRole("button", { name: "Increase quantity" }).click();
  await bun.getByRole("button", { name: /Add to cart/ }).click();
  await expect(bun).toBeHidden();
  const summary = page.getByRole("region", { name: "Cart summary" });
  await expect(summary).toContainText("3 items");
  await expect(page.getByRole("article", { name: "Bun Maska" })).toContainText("2 in cart");
  await expect(page.getByRole("article", { name: "Kachori" })).not.toContainText("in cart");

  // The cart survives a reload (persisted), and can be cleared.
  await page.reload();
  await expect(summary).toContainText("3 items");
  await summary.getByRole("button", { name: "Clear cart" }).click();
  await expect(summary).toHaveCount(0);
});

test("search filters shops by name", async ({ page }) => {
  await logInAsStudent(page);
  await page.getByRole("searchbox", { name: "Search shops by name" }).fill("DOSA");
  await expect(page).toHaveURL(/\/shops\?q=DOSA$/);
  const shops = page.getByRole("list", { name: "Shops" });
  await expect(shops.getByRole("heading")).toHaveText([DOSA_SHOP.name]);

  await page.getByRole("searchbox", { name: "Search shops by name" }).fill("pizza palace");
  await expect(page.getByText("No shops match “pizza palace”")).toBeVisible();
  await page.getByRole("link", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/shops$/);
  // Other specs may register extra shops, so check the seeded ones are all back rather than an exact count.
  for (const name of SEEDED_SHOPS) await expect(shops.getByRole("heading", { name })).toBeVisible();
});

test("the cart holds one shop at a time and asks before switching", async ({ page }) => {
  await logInAsStudent(page);
  await page.goto(`/shops/${CHAI_SHOP.id}`);
  await page.getByRole("button", { name: "Add Masala Chai to cart" }).click();
  const summary = page.getByRole("region", { name: "Cart summary" });
  await expect(summary).toContainText(`from ${CHAI_SHOP.name}`);

  await page.goto(`/shops/${DOSA_SHOP.id}`);
  await page.getByRole("button", { name: "Add Masala Dosa to cart" }).click();
  const confirm = page.getByRole("dialog", { name: "Start a new cart?" });
  await expect(confirm).toContainText(CHAI_SHOP.name);
  await confirm.getByRole("button", { name: "Keep current cart" }).click();
  await expect(confirm).toBeHidden();
  await expect(summary).toContainText(`1 item`);
  await expect(summary).toContainText(`from ${CHAI_SHOP.name}`);

  await page.getByRole("button", { name: "Add Masala Dosa to cart" }).click();
  await confirm.getByRole("button", { name: "Clear cart and add" }).click();
  await expect(summary).toContainText(`from ${DOSA_SHOP.name}`);
  await expect(summary).toContainText("1 item");
  await expect(page.getByRole("article", { name: "Masala Dosa", exact: true })).toContainText("1 in cart");
  await summary.getByRole("button", { name: "Clear cart" }).click();
});

test("a closed shop's menu is visible but nothing can be added", async ({ page }) => {
  await setShopOpen(DOSA_SHOP.id, false);
  try {
    await logInAsStudent(page);
    const card = page.getByRole("list", { name: "Shops" }).getByRole("link", { name: new RegExp(DOSA_SHOP.name) });
    await expect(card).toContainText("Closed");
    await card.click();
    await expect(page.getByText("This shop is closed right now.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Masala Dosa can't be added: shop is closed", exact: true })).toBeDisabled();
  } finally {
    await setShopOpen(DOSA_SHOP.id, true);
  }
});

test("an unknown shop shows a not-found state", async ({ page }) => {
  await logInAsStudent(page);
  await page.goto("/shops/does-not-exist");
  await expect(page.getByText("Shop not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse all shops" })).toBeVisible();
});
