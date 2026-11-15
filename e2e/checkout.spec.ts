import { expect, test, type Page } from "@playwright/test";

// Seeded data (prisma/seed-data.ts): shop3 is the juice bar; student2 / student123. The E2E server runs with
// PAYMENTS_PROVIDER=mock, so checkout goes to /pay/mock/[orderId].
const JUICE_BAR = { id: "seed_shop3", name: "Fresh Squeeze Juice Bar" };

async function logIn(page: Page, path: string, email: string, password: string, landing: RegExp) {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(landing);
}

const logInStudent = (page: Page) => logIn(page, "/login", "student2@pec.test", "student123", /\/shops$/);

async function fillCart(page: Page) {
  await page.goto(`/shops/${JUICE_BAR.id}`);
  await page.getByRole("button", { name: "Add Banana Shake to cart" }).click();
  await page.getByRole("button", { name: "Add Banana Shake to cart" }).click();
  await page.getByRole("button", { name: "Add Fruit Bowl to cart" }).click();
  const summary = page.getByRole("region", { name: "Cart summary" });
  await expect(summary).toContainText("3 items");
  await summary.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
}

test("cart → mock pay → PLACED_PAID; the cart empties and the shop sees the paid order", async ({ page, browser }) => {
  await logInStudent(page);
  await fillCart(page);

  const items = page.getByRole("region", { name: "Cart items" });
  await expect(items.getByRole("listitem")).toHaveCount(2);
  const subtotal = page.getByTestId("cart-subtotal");
  const before = await subtotal.textContent();

  // Quantity − / + and remove work, and the subtotal follows.
  await page.getByRole("button", { name: "Decrease Banana Shake quantity" }).click();
  await expect(page.getByLabel("Banana Shake quantity", { exact: true })).toHaveText("1");
  await expect(subtotal).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Increase Banana Shake quantity" }).click();
  await expect(page.getByLabel("Banana Shake quantity", { exact: true })).toHaveText("2");
  await expect(subtotal).toHaveText(before ?? "");
  await expect(page.getByRole("link", { name: "Cart, 3 items" })).toBeVisible();

  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/\/pay\/mock\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Test payment" })).toBeVisible();
  const summary = page.getByRole("region", { name: "Order summary" });
  await expect(summary).toContainText("2 × Banana Shake");
  await expect(summary).toContainText("1 × Fruit Bowl");
  await expect(summary.locator("[data-status]")).toHaveAttribute("data-status", "PENDING_PAYMENT");
  const orderNumber = (await summary.getByText(/^Order #PEC/).textContent())!.replace("Order #", "").trim();

  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/\/checkout\/success\?orderId=/);
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Order summary" }).locator("[data-status]")).toHaveAttribute("data-status", "PLACED_PAID");

  // The cart is cleared once paid.
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toBeVisible();
  await expect(page.getByText("Your cart is empty")).toBeVisible();

  // The order is in the customer's history…
  await page.goto("/orders");
  await expect(page.getByText(`#${orderNumber}`).filter({ visible: true })).toBeVisible();

  // …and on the shop's dashboard as a new paid order.
  const shopContext = await browser.newContext();
  const shopPage = await shopContext.newPage();
  await logIn(shopPage, "/shop/login", "shop3@pec.test", "shop123", /\/shop$/);
  await shopPage.goto("/shop/orders");
  const card = shopPage.getByRole("article", { name: `Order ${orderNumber}` });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Paid online");
  await expect(card.locator("[data-status]").first()).toHaveAttribute("data-status", "PLACED_PAID");
  await shopContext.close();
});

test("a failed payment keeps the cart and never reaches the shop; retrying succeeds", async ({ page, browser }) => {
  await logInStudent(page);
  await fillCart(page);

  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  const failedNumber = (await page.getByText(/^Order #PEC/).textContent())!.replace("Order #", "").trim();
  await page.getByRole("button", { name: "Fail payment" }).click();

  await expect(page).toHaveURL(/\/checkout\/cancel\?orderId=/);
  await expect(page.getByRole("heading", { name: "Payment cancelled" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Order summary" }).locator("[data-status]")).toHaveAttribute(
    "data-status",
    "PAYMENT_FAILED",
  );

  // The cart is still there.
  await page.getByRole("link", { name: "Back to cart" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("region", { name: "Cart items" }).getByRole("listitem")).toHaveCount(2);

  // The failed order never shows up for the shop.
  const shopContext = await browser.newContext();
  const shopPage = await shopContext.newPage();
  await logIn(shopPage, "/shop/login", "shop3@pec.test", "shop123", /\/shop$/);
  await shopPage.goto("/shop/orders");
  await expect(shopPage.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(shopPage.getByRole("article", { name: `Order ${failedNumber}` })).toHaveCount(0);
  await shopContext.close();

  // Retry from the kept cart.
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
});

test("the server refuses a checkout once a dish goes out of stock and the cart flags it", async ({ page, browser }) => {
  await logInStudent(page);
  await page.goto(`/shops/${JUICE_BAR.id}`);
  await page.getByRole("button", { name: "Add Pineapple Juice to cart" }).click();
  await page.getByRole("region", { name: "Cart summary" }).getByRole("link", { name: "View cart" }).click();

  // The shop marks it out of stock after it was added.
  const shopContext = await browser.newContext();
  const shopPage = await shopContext.newPage();
  await logIn(shopPage, "/shop/login", "shop3@pec.test", "shop123", /\/shop$/);
  await shopPage.goto("/shop/menu");
  const stock = shopPage.getByRole("switch", { name: /Pineapple Juice/ });
  // The switch flips optimistically; wait until the server has saved the change.
  const setStock = async (inStock: boolean) => {
    const saved = shopPage.waitForResponse((r) => r.url().includes("/stock") && r.request().method() === "PATCH");
    await stock.click();
    expect((await saved).ok()).toBe(true);
    await expect(stock).toHaveAttribute("aria-checked", String(inStock));
  };
  await setStock(false);

  try {
    await page.getByRole("button", { name: /^Pay / }).click();
    await expect(page.getByRole("region", { name: "Order summary" }).getByRole("alert")).toContainText(
      "Out of stock: Pineapple Juice",
    );
    await expect(page.getByText("Unavailable — please remove it.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay / })).toBeDisabled();
    await page.getByRole("button", { name: "Remove Pineapple Juice" }).click();
    await expect(page.getByText("Your cart is empty")).toBeVisible();
  } finally {
    await setStock(true);
    await shopContext.close();
  }
});

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page must not scroll horizontally").toBeLessThanOrEqual(clientWidth);
}

test("cart and payment pages fit a 375px screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await logInStudent(page);
  await fillCart(page);
  await expectNoHorizontalScroll(page);
  await testInfo.attach("cart-375", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page).toHaveURL(/\/pay\/mock\//);
  await expectNoHorizontalScroll(page);
  await testInfo.attach("mock-pay-375", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.getByRole("button", { name: "Fail payment" }).click();
  await expect(page.getByRole("heading", { name: "Payment cancelled" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
