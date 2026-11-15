# SPEC audit — PEC Market

**Date:** 2026-11-15 · **Audited:** `docs/SPEC.md` (§1–§11), compared requirement by requirement against the code
in `src/app/**`, `src/components/**`, `src/server/**`, `src/lib/**`, `prisma/schema.prisma`, `prisma/seed*.ts`,
`server.ts`, `tests/**` and `e2e/**`.

**Method:** each SPEC sentence/table cell was split into atomic requirements. Each was verified by reading the
implementing page/component/service (not `docs/PROGRESS.md`), then grepping for counter-evidence before marking a
gap. Deliberate interpretations recorded in `docs/DECISIONS.md` count as implemented and are cited (e.g. "P04").
"Tested by" lists the Vitest (`tests/**`, `src/**/*.test.ts`) and Playwright (`e2e/*.spec.ts`) files that clearly
cover the row.

Status legend: ✅ Implemented · ⚠️ Partial · ❌ Missing.

SPEC.md has no "deliverables" section (README / ARCHITECTURE / SDLC docs are not SPEC requirements), so no
deliverable rows appear below. For reference, P13 added `README.md`, `docs/ARCHITECTURE.md` and `docs/SDLC.md`.

**Follow-up (P13):** the one gap the audit found (11.4, live shops list) has been fixed; the row and counts below
show the state after the fix, and the original finding is kept under "Gaps (resolved)".

---

## §1 Summary

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 1.1 | Marketplace for PEC market food shops; students "browse shops, order, and pay online via Stripe" | ✅ | `src/app/(customer)/shops/page.tsx`, `src/app/(customer)/cart/page.tsx`, `src/server/orders/checkout.ts`, `src/server/payments/stripe.ts` | Tested by `e2e/journeys.spec.ts` (1 · golden path), `tests/api/checkout.test.ts` |
| 1.2 | Shops "receive the order automatically and update its status, which the customer sees live" | ✅ | `src/server/orders/payment.ts` (`markOrderPaid`), `src/server/orders/changeStatus.ts`, `src/server/realtime/emit.ts`, `src/components/realtime/LiveRefresh.tsx` | Tested by `e2e/realtime.spec.ts`, `tests/realtime.test.ts` |
| 1.3 | Three portals: **Customer**, **Shop Owner**, **Admin** | ✅ | `src/app/(customer)/layout.tsx`, `src/app/(shop)/shop/layout.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/proxy.ts` | Tested by `tests/proxy.test.ts`, `e2e/journeys.spec.ts` (6 · role-gating) |
| 1.4 | "**Online payment only** — no cash/offline option anywhere" | ✅ | `src/components/cart/CartView.tsx` (only "Pay" → `/api/checkout`), `src/lib/validation/checkout.ts` | No payment-method choice exists in UI or API (grep for cash/offline: none) |

## §2 Roles and auth

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 2.1 | Customer signup page `/signup` | ✅ | `src/app/(auth)/signup/page.tsx`, `src/components/auth/CustomerSignupForm.tsx`, `src/app/api/auth/signup/route.ts` | Tested by `tests/api/signup.test.ts`, `e2e/auth.spec.ts` |
| 2.2 | Customer login page `/login` | ✅ | `src/app/(auth)/login/page.tsx`, `src/components/auth/LoginForm.tsx`, `src/app/api/auth/login/route.ts` | Tested by `tests/api/login.test.ts`, `e2e/auth.spec.ts` |
| 2.3 | Shop-owner signup page `/shop/signup` | ✅ | `src/app/(auth)/shop/signup/page.tsx`, `src/components/auth/ShopSignupForm.tsx`, `src/app/api/auth/shop-signup/route.ts` | Tested by `tests/api/signup.test.ts`, `e2e/auth.spec.ts` ("shop owner signs up with a logo") |
| 2.4 | Shop-owner login page `/shop/login` | ✅ | `src/app/(auth)/shop/login/page.tsx` | Tested by `e2e/auth.spec.ts` |
| 2.5 | Admin logs in at `/admin/login` | ✅ | `src/app/(auth)/admin/login/page.tsx` | Tested by `e2e/auth.spec.ts`, `tests/api/login.test.ts` |
| 2.6 | "admins are created only by the seed script" | ✅ | `src/server/auth/service.ts` (signup hard-codes `CUSTOMER` / `SHOP_OWNER`), `prisma/seed.ts` | No admin signup route or page exists |
| 2.7 | Email/password auth | ✅ | `src/server/auth/service.ts`, `src/server/auth/password.ts` (bcryptjs) | Tested by `tests/api/login.test.ts` |
| 2.8 | "JWT in httpOnly cookie" | ✅ | `src/server/auth/jwt.ts`, `src/server/auth/session.ts` | HS256, `pec_session`, httpOnly, SameSite=Lax (DECISIONS P03). Tested by `tests/api/login.test.ts` |
| 2.9 | Wrong portal with a valid account shows "This account is a <role> account" | ✅ | `src/server/auth/service.ts` (`WRONG_PORTAL`), `src/components/auth/LoginForm.tsx` | DECISIONS P03. Tested by `tests/api/login.test.ts`, `e2e/auth.spec.ts` ("wrong portal login explains…") |
| 2.10 | … "and a link to the right portal" | ✅ | `src/components/auth/LoginForm.tsx` ("Go to the right login page" → `loginPath`) | Tested by `e2e/auth.spec.ts` |
| 2.11 | "Each shop-owner account owns exactly one Shop, created during shop signup" | ✅ | `prisma/schema.prisma` (`Shop.ownerId @unique`), `src/server/auth/service.ts` (`signupShopOwner`, one transaction) | Tested by `tests/api/signup.test.ts` |
| 2.12 | Shop signup field: name | ✅ | `src/components/auth/ShopSignupForm.tsx` ("Shop name") | |
| 2.13 | Shop signup field: description | ✅ | `src/components/auth/ShopSignupForm.tsx` ("Description (optional)") | |
| 2.14 | Shop signup field: logo (upload) | ✅ | `src/components/auth/ShopSignupForm.tsx` (`name="logo"`), `src/server/storage/local.ts` | Optional; placeholder SVG generated otherwise (DECISIONS P03). Tested by `e2e/auth.spec.ts` |
| 2.15 | Shop signup field: location, free text ("Stall 4, near SAC") | ✅ | `src/components/auth/ShopSignupForm.tsx` ("Location in the market"), `src/lib/validation/auth.ts` | |
| 2.16 | Account status enum `ACTIVE`, `WARNED`, `SUSPENDED` | ✅ | `prisma/schema.prisma` (`AccountStatus`) | |
| 2.17 | Suspended users "cannot log in" | ✅ | `src/server/auth/service.ts` (`ACCOUNT_SUSPENDED`) | Tested by `tests/api/login.test.ts`, `e2e/auth.spec.ts` |
| 2.18 | Suspended users cannot "call any API" | ✅ | `src/server/auth/guards.ts` (`requireUser` rejects SUSPENDED, clears cookie), `src/server/realtime/server.ts` (socket handshake) | Every non-public route calls a guard (verified by grep; public: auth, health, Stripe webhook, uploads GET — DECISIONS P01/P03/P06). Tested by `tests/api/guards.test.ts`, `tests/api/admin.test.ts` |
| 2.19 | Suspended users "see a clear message" | ✅ | `src/lib/account.ts` (`SUSPENDED_MESSAGE`), `src/components/auth/LoginPage.tsx` (`?reason=suspended`) | DECISIONS P03. Tested by `e2e/auth.spec.ts`, `e2e/admin.spec.ts` |
| 2.20 | Warned users see a "dismissible banner with the warning reason" | ✅ | `src/components/shell/WarningBanner.tsx`, `src/app/(customer)/layout.tsx`, `src/app/(shop)/shop/layout.tsx` | Dismissal per warning text (DECISIONS P03). Tested by `e2e/auth.spec.ts` ("a warned customer sees a dismissible banner") |

## §3 Customer portal

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 3.1 | Browse shops: "list of active shops" | ✅ | `src/app/(customer)/shops/page.tsx`, `src/server/shops/list.ts` (`listBrowsableShops`) | "Active" = owner not suspended (DECISIONS P04). Tested by `tests/api/shops.test.ts`, `e2e/browsing.spec.ts` |
| 3.2 | Shop card shows logo | ✅ | `src/components/shops/ShopCard.tsx` (`Thumb src={shop.logoUrl}`) | |
| 3.3 | Shop card shows name | ✅ | `src/components/shops/ShopCard.tsx` | |
| 3.4 | Shop card shows location | ✅ | `src/components/shops/ShopCard.tsx` (MapPin + location) | |
| 3.5 | Shop card shows average rating | ✅ | `src/components/shops/ShopCard.tsx`, `src/components/ui/Rating.tsx`, `src/server/shops/list.ts` (`ratingsFor`) | 1 decimal + count (DECISIONS P04). Tested by `tests/api/shops.test.ts` |
| 3.6 | Shop card shows open/closed | ✅ | `src/components/shops/ShopCard.tsx` (Open/Closed pill) | Live on the list page since P13 — see 11.4 |
| 3.7 | "Search by name" | ✅ | `src/components/shops/ShopSearch.tsx`, `src/server/shops/list.ts` (case-insensitive `contains`) | Tested by `e2e/browsing.spec.ts` ("search filters shops by name"), `tests/api/shops.test.ts` |
| 3.8 | Shop menu per dish: name | ✅ | `src/components/shops/DishCard.tsx`, `src/components/shops/DishSheet.tsx` | |
| 3.9 | Per dish: photo | ✅ | `src/components/shops/DishCard.tsx` (`Thumb src={dish.photoUrl}`) | Photo upload is optional for shops; a placeholder icon is shown when absent (`src/components/ui/Thumb.tsx`). Not recorded in DECISIONS |
| 3.10 | Per dish: price | ✅ | `src/components/shops/DishCard.tsx` (`formatPaise`) | |
| 3.11 | Per dish: est. prep time | ✅ | `src/components/shops/DishCard.tsx` ("~N min") | |
| 3.12 | Per dish: description | ✅ | `src/components/shops/DishCard.tsx`, `src/components/shops/DishSheet.tsx` | |
| 3.13 | Per dish: "live in-stock / out-of-stock (updates without refresh)" | ✅ | `src/app/(customer)/shops/[shopId]/page.tsx` (`LiveRefresh` on `menu:item`, `menu:` room), `src/server/shops/menu.ts` (emit) | Tested by `e2e/realtime.spec.ts` ("a stock toggle shows up live…"), `tests/realtime.test.ts` |
| 3.14 | "Out-of-stock dishes are visible but cannot be added" | ✅ | `src/components/shops/DishCard.tsx` (disabled Add), `src/lib/cart/cart.ts`, `src/server/orders/checkout.ts` (`OUT_OF_STOCK`) | Tested by `e2e/browsing.spec.ts`, `src/lib/cart/cart.test.ts`, `tests/api/checkout.test.ts` |
| 3.15 | Cart holds items from "one shop at a time" | ✅ | `src/lib/cart/cart.ts`, `src/lib/cart/store.ts` | Tested by `src/lib/cart/cart.test.ts` |
| 3.16 | "adding from a second shop asks to clear the cart" | ✅ | `src/components/shops/ShopMenu.tsx` ("Start a new cart?" sheet) | Tested by `e2e/browsing.spec.ts` ("the cart holds one shop at a time…") |
| 3.17 | Cart: quantity +/− | ✅ | `src/components/cart/CartView.tsx` (Increase/Decrease buttons) | Line cap 20 (DECISIONS P04) |
| 3.18 | Cart: remove | ✅ | `src/components/cart/CartView.tsx` ("Remove <dish>") | |
| 3.19 | Cart: subtotal | ✅ | `src/components/cart/CartView.tsx` (`cart-subtotal`) | Tested by `e2e/checkout.spec.ts` |
| 3.20 | Checkout: "Server re-validates stock and prices" | ✅ | `src/server/orders/checkout.ts` (`validateCart` inside the transaction; `PRICE_CHANGED`, `OUT_OF_STOCK`, `ITEM_UNAVAILABLE`, `SHOP_CLOSED`) | DECISIONS P06. Tested by `tests/api/checkout.test.ts`, `e2e/checkout.spec.ts` |
| 3.21 | Checkout creates Order `PENDING_PAYMENT` with `price_at_order` snapshots | ✅ | `src/server/orders/checkout.ts` (`createPendingOrder`, `pricePaiseAtOrder`, `nameAtOrder`) | Tested by `tests/api/checkout.test.ts` |
| 3.22 | "then redirects to Stripe Checkout" | ✅ | `src/server/payments/stripe.ts` (`createCheckout`), `src/components/cart/CartView.tsx` (`window.location.assign(checkoutUrl)`) | Tested by `src/server/payments/stripe.test.ts` |
| 3.23 | "No service fee or tax lines" | ✅ | `src/server/orders/checkout.ts` (total = Σ lines), `src/components/cart/CartView.tsx` | |
| 3.24 | Payment succeeds via webhook **or** success-page verification, "whichever comes first, idempotent" | ✅ | `src/server/orders/payment.ts` (`markOrderPaid`, `confirmCheckoutPayment`), `src/app/api/payments/stripe/webhook/route.ts`, `src/app/(customer)/checkout/success/page.tsx` | DECISIONS P06. Tested by `tests/api/payments.test.ts` (twice / concurrently = no-op) |
| 3.25 | Order becomes `PLACED_PAID` | ✅ | `src/server/orders/payment.ts` | Tested by `tests/api/payments.test.ts` |
| 3.26 | Shop gets a "real-time notification" on payment | ✅ | `src/server/orders/changeStatus.ts` (`notificationsFor` → NEW_ORDER), `src/components/notifications/NotificationsProvider.tsx` (toast) | DECISIONS P05/P08. Tested by `tests/realtime.test.ts`, `e2e/realtime.spec.ts` |
| 3.27 | "the order appears on its dashboard instantly" | ✅ | `src/app/(shop)/shop/orders/page.tsx`, `src/app/(shop)/shop/page.tsx` (`LiveRefresh` on `order:status`, `shop:` room) | Tested by `e2e/realtime.spec.ts` |
| 3.28 | Cancelled/failed checkout → order `PAYMENT_FAILED` | ✅ | `src/server/orders/payment.ts` (`markOrderPaymentFailed`), `src/app/(customer)/checkout/cancel/page.tsx` | DECISIONS P06. Tested by `tests/api/payments.test.ts`, `e2e/checkout.spec.ts` |
| 3.29 | … payment `FAILED` | ✅ | `src/server/orders/payment.ts` (`paymentStatus: "FAILED"`) | Tested by `tests/api/payments.test.ts` |
| 3.30 | "cart is kept so the user can retry" | ✅ | `src/components/checkout/ClearCartOnMount.tsx` (only on success), `src/app/(customer)/checkout/cancel/page.tsx` | Tested by `e2e/checkout.spec.ts`, `e2e/journeys.spec.ts` (2) |
| 3.31 | "Unpaid orders never reach the shop" | ✅ | `src/server/shops/orders.ts`, `src/server/auth/access.ts` (`orderAccessFor`) | DECISIONS P05/P07. Tested by `tests/api/shop-orders.test.ts`, `e2e/checkout.spec.ts` |
| 3.32 | Live tracking: order page "status timeline that updates in real time" | ✅ | `src/app/(customer)/orders/[orderId]/page.tsx` (`LiveRefresh`, `order:` room), `src/components/orders/OrderTracker.tsx`, `src/components/orders/OrderTimeline.tsx` | Tested by `e2e/realtime.spec.ts` (PREPARING within 3 s), `e2e/orders.spec.ts` |
| 3.33 | Steps "Placed & Paid → Preparing → Ready for Pickup → Completed" | ✅ | `src/lib/order-tracking.ts`, `src/components/orders/OrderTracker.tsx` | DECISIONS P07. Tested by `src/lib/order-tracking.test.ts` |
| 3.34 | "estimated ready time (max prep time of items from when Preparing started)" | ✅ | `src/lib/order-tracking.ts` (latest PREPARING event + max `prepTimeMinutes`), `src/components/orders/OrderTracker.tsx` | Uses current dish prep time (DECISIONS P07). Tested by `src/lib/order-tracking.test.ts`, `tests/api/customer-orders.test.ts` |
| 3.35 | Order history: "All past and current orders" | ✅ | `src/app/(customer)/orders/page.tsx`, `src/server/orders/history.ts` | Every status in exactly one tab, each capped at 100 (DECISIONS P07) |
| 3.36 | Order history "newest first" | ✅ | `src/server/orders/history.ts` (`orderBy: { createdAt: "desc" }`) | Tested by `tests/api/customer-orders.test.ts` |
| 3.37 | Order history "colour-coded status badges" | ✅ | `src/components/orders/CustomerOrderCard.tsx` (`StatusBadge`) | |
| 3.38 | Order history "Active" and "Past" tabs | ✅ | `src/components/orders/CustomerOrderTabs.tsx`, `src/lib/order-status.ts` (`CUSTOMER_ORDER_TABS`) | DECISIONS P07. Tested by `e2e/orders.spec.ts` |
| 3.39 | Refunds & complaints (→ §6) | ✅ | `src/components/disputes/CustomerDisputeActions.tsx`, `src/components/disputes/DisputeCard.tsx` | See §6 |
| 3.40 | Reviews "Only when order is `COMPLETED`" | ✅ | `src/server/reviews/reviews.ts` (409 `REVIEW_NOT_AVAILABLE`), `src/app/(customer)/orders/[orderId]/page.tsx` | DECISIONS P10. Tested by `tests/api/reviews.test.ts` |
| 3.41 | "one review per order" | ✅ | `prisma/schema.prisma` (`Review.orderId @unique`), `src/server/reviews/reviews.ts` (`ALREADY_REVIEWED`) | Tested by `tests/api/reviews.test.ts` (racing duplicates) |
| 3.42 | Review "1–5 stars" | ✅ | `src/lib/validation/reviews.ts`, `src/components/reviews/ReviewForm.tsx` | Tested by `tests/api/reviews.test.ts` |
| 3.43 | Review "text (optional, ≤1000 chars)" | ✅ | `src/lib/validation/reviews.ts` (`MAX_REVIEW_COMMENT = 1000`) | Tested by `tests/api/reviews.test.ts` |
| 3.44 | Review "up to 3 photos" | ✅ | `src/lib/validation/reviews.ts` (`MAX_REVIEW_PHOTOS = 3`), `src/app/api/orders/[orderId]/review/route.ts` | DECISIONS P10/P12. Tested by `tests/api/reviews.test.ts` |
| 3.45 | Reviews "Shown on the shop page with average rating" | ✅ | `src/app/(customer)/shops/[shopId]/page.tsx` (Reviews section + average), `src/components/reviews/ReviewCard.tsx` | DECISIONS P10. Tested by `e2e/reviews.spec.ts` |
| 3.46 | Notifications: "Bell icon with unread count" | ✅ | `src/components/notifications/NotificationBell.tsx`, `src/components/shell/CustomerShell.tsx` | Tested by `e2e/realtime.spec.ts` |
| 3.47 | Notifications: "in-app list" | ✅ | `src/app/(customer)/notifications/page.tsx`, `src/components/notifications/NotificationsPage.tsx`, `src/app/api/notifications/route.ts` | Tested by `tests/api/notifications.test.ts` |
| 3.48 | "real-time toast on every status change of the user's orders" | ✅ | `src/server/orders/changeStatus.ts` (`emitNotifications`), `src/components/notifications/Toaster.tsx` | Toast for every change the customer did not make themselves (DECISIONS P05/P08). Tested by `e2e/realtime.spec.ts` |
| 3.49 | … "and dispute updates" | ✅ | `src/server/disputes/respond.ts` (reply/approve/reject/resolve notifications), `src/server/admin/disputes.ts` | DECISIONS P09/P11. Tested by `tests/api/disputes.test.ts`, `e2e/disputes.spec.ts` (reply toast) |
| 3.50 | "Mark read" | ✅ | `src/app/api/notifications/read/route.ts` (`{ ids }`), `src/components/notifications/NotificationsProvider.tsx` | Tested by `tests/api/notifications.test.ts` |
| 3.51 | "mark all read" | ✅ | `src/app/api/notifications/read/route.ts` (`{ all: true }`), `src/components/notifications/NotificationsPage.tsx` | Tested by `tests/api/notifications.test.ts`, `e2e/realtime.spec.ts` |

## §4 Shop portal

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 4.1 | Incoming orders dashboard "Live list (new orders appear without refresh)" | ✅ | `src/app/(shop)/shop/orders/page.tsx` (`LiveRefresh` on `order:status`) | Tested by `e2e/realtime.spec.ts` |
| 4.2 | "with a sound-free highlight" | ✅ | `src/components/shop/ShopOrderCard.tsx` (blue ring for PLACED_PAID); toasts make no sound | DECISIONS P05/P08 |
| 4.3 | Each order: order number | ✅ | `src/components/shop/ShopOrderCard.tsx` | |
| 4.4 | Each order: items + qty | ✅ | `src/components/shop/ShopOrderCard.tsx` | |
| 4.5 | Each order: customer name | ✅ | `src/components/shop/ShopOrderCard.tsx` | |
| 4.6 | Each order: total | ✅ | `src/components/shop/ShopOrderCard.tsx` | |
| 4.7 | Each order: payment status | ✅ | `src/components/shop/ShopOrderCard.tsx` (`PAYMENT_STATUS_LABEL`) | |
| 4.8 | Each order: time placed | ✅ | `src/components/shop/ShopOrderCard.tsx` (`formatDateTime(createdAt)`) | |
| 4.9 | Each order: status | ✅ | `src/components/shop/ShopOrderCard.tsx` (`StatusBadge`) | |
| 4.10 | "Filter: Active / Completed / Disputes" | ✅ | `src/components/shop/OrderFilterTabs.tsx`, `src/server/shops/orders.ts` | DECISIONS P05. Tested by `tests/api/shop-orders.test.ts` |
| 4.11 | Button "Payment received – start preparing" `PLACED_PAID → PREPARING` | ✅ | `src/lib/order-status.ts` (`KITCHEN_ACTION_LABEL`), `src/components/shop/KitchenActionButton.tsx`, `src/app/api/shops/[shopId]/orders/[orderId]/status/route.ts` | Tested by `tests/api/shop-orders.test.ts`, `e2e/shop-portal.spec.ts` |
| 4.12 | "customer is updated instantly" | ✅ | `src/server/orders/changeStatus.ts` → `emit()` to `user:`/`order:` | Tested by `e2e/realtime.spec.ts`, `tests/realtime.test.ts` |
| 4.13 | "Ready for pickup" `PREPARING → READY_FOR_PICKUP` | ✅ | `src/lib/order-status.ts`, `src/components/shop/KitchenActionButton.tsx` | Tested by `e2e/shop-portal.spec.ts` |
| 4.14 | "Mark completed" `READY_FOR_PICKUP → COMPLETED` | ✅ | same | Tested by `e2e/shop-portal.spec.ts`, `tests/api/customer-orders.test.ts` |
| 4.15 | Menu: add dish | ✅ | `src/components/shop/MenuManager.tsx`, `src/components/shop/DishForm.tsx`, `src/app/api/shops/[shopId]/menu/route.ts` | Tested by `tests/api/shop-menu.test.ts`, `e2e/shop-portal.spec.ts` |
| 4.16 | Menu: edit dish | ✅ | `src/app/api/shops/[shopId]/menu/[itemId]/route.ts` (PATCH), `src/components/shop/DishForm.tsx` | Tested by same |
| 4.17 | Menu: delete dish | ✅ | `src/server/shops/menu.ts` (`deleteMenuItem`) | Tested by same |
| 4.18 | Dish fields: name, description, photo upload, price, prep time minutes | ✅ | `src/components/shop/DishForm.tsx`, `src/lib/validation/shop-portal.ts` | Rupee input → paise, ₹1–₹5,000, 1–180 min (DECISIONS P05) |
| 4.19 | "Deleting a dish that appears in past orders soft-deletes it (`isArchived`)" | ✅ | `src/server/shops/menu.ts` (archive when referenced, also on FK race) | DECISIONS P05. Tested by `tests/api/shop-menu.test.ts` |
| 4.20 | Stock control: "One-tap in/out-of-stock toggle per dish" | ✅ | `src/components/shop/MenuManager.tsx` (`Switch`), `src/app/api/shops/[shopId]/menu/[itemId]/stock/route.ts` | Tested by `tests/api/shop-menu.test.ts` |
| 4.21 | "customers viewing the menu see it change live" | ✅ | `src/server/shops/menu.ts` (emit `menu:item`), `src/app/(customer)/shops/[shopId]/page.tsx` | Tested by `e2e/realtime.spec.ts` |
| 4.22 | Shop profile: edit name, description, logo, location | ✅ | `src/app/(shop)/shop/profile/page.tsx`, `src/components/shop/ShopProfileForm.tsx`, `src/server/shops/profile.ts` | DECISIONS P05. Tested by `tests/api/shop-profile.test.ts`, `e2e/shop-portal.spec.ts` |
| 4.23 | Shop profile: "toggle shop open/closed" | ✅ | `src/components/shop/ShopOpenToggle.tsx`, `src/components/shop/ShopProfileForm.tsx` | Tested by `e2e/shop-portal.spec.ts` |
| 4.24 | Disputes: view and respond to refund requests and complaints on its orders | ✅ | `src/app/(shop)/shop/orders/[orderId]/page.tsx`, `src/components/disputes/ShopDisputeActions.tsx`, `src/app/api/shops/[shopId]/disputes/[complaintId]/route.ts` | DECISIONS P09. Tested by `tests/api/disputes.test.ts`, `e2e/disputes.spec.ts` |
| 4.25 | Report customer "From an order" | ✅ | `src/components/shop/ReportCustomer.tsx` on `src/app/(shop)/shop/orders/[orderId]/page.tsx`, `src/app/api/shops/[shopId]/orders/[orderId]/report/route.ts` | DECISIONS P11. Tested by `tests/api/admin.test.ts`, `e2e/admin.spec.ts` |
| 4.26 | Report reason `NO_SHOW`, `MISBEHAVIOR`, `OTHER` + description | ✅ | `prisma/schema.prisma` (`ReportReason`), `src/lib/reports.ts`, `src/components/shop/ReportCustomer.tsx` | |
| 4.27 | Report "Goes to admin" | ✅ | `src/server/reports/reports.ts` (REPORT notification + `report:changed` to `admin`), `src/app/(admin)/admin/reports/page.tsx` | Tested by `tests/api/admin.test.ts` |

## §5 Order status flow

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 5.1 | Order `status` enum (10 values: PENDING_PAYMENT … RESOLVED) | ✅ | `prisma/schema.prisma` (`OrderStatus`) | All 10 values present |
| 5.2 | `paymentStatus` enum PENDING, PAID, REFUND_REQUESTED, REFUNDED, PARTIALLY_REFUNDED, FAILED | ✅ | `prisma/schema.prisma` (`PaymentStatus`) | All 6 values present |
| 5.3 | "anything else is rejected with 409" | ✅ | `src/lib/order-state.ts` (`InvalidTransitionError` 409) | Wrong actor on an existing transition → 403 (DECISIONS P02); kitchen endpoint rejects non-kitchen targets with 400 (P05). Tested by `src/lib/order-state.test.ts`, `tests/api/shop-orders.test.ts` |
| 5.4 | PENDING_PAYMENT → PLACED_PAID (system) | ✅ | `src/lib/order-state.ts`, `src/server/orders/payment.ts` | Tested by `src/lib/order-state.test.ts`, `tests/api/payments.test.ts` |
| 5.5 | PENDING_PAYMENT → PAYMENT_FAILED (system) | ✅ | same | Tested by same |
| 5.6 | PAYMENT_FAILED → PLACED_PAID (system, late success) | ✅ | same | Tested by `tests/api/payments.test.ts` (late success) |
| 5.7 | PLACED_PAID → PREPARING (shop) | ✅ | `src/lib/order-state.ts` | Tested by `src/lib/order-state.test.ts` |
| 5.8 | PREPARING → READY_FOR_PICKUP (shop) | ✅ | same | Tested by same |
| 5.9 | READY_FOR_PICKUP → COMPLETED (shop) | ✅ | same | Tested by same |
| 5.10 | PLACED_PAID/PREPARING/READY_FOR_PICKUP → REFUND_REQUESTED (customer) | ✅ | `src/lib/order-state.ts`, `src/server/disputes/customer.ts` | Tested by `tests/api/disputes.test.ts` |
| 5.11 | REFUND_REQUESTED → REFUNDED (shop approve / admin force) | ✅ | `src/lib/order-state.ts`, `src/server/disputes/respond.ts`, `src/server/admin/disputes.ts` | Tested by `tests/api/disputes.test.ts`, `tests/api/admin-disputes.test.ts` |
| 5.12 | REFUND_REQUESTED → *previous status* on shop reject (escalates, order resumes) | ✅ | `src/lib/order-state.ts` (`requiresPreviousStatus`), `src/server/disputes/respond.ts` | DECISIONS P02/P09. Tested by `tests/api/disputes.test.ts` |
| 5.13 | PLACED_PAID … COMPLETED → COMPLAINT_FILED (customer) | ✅ | `src/lib/order-state.ts` (`COMPLAINABLE_STATUSES`) | DECISIONS P02. Tested by `tests/api/disputes.test.ts` |
| 5.14 | COMPLAINT_FILED → RESOLVED (shop or admin) | ✅ | `src/lib/order-state.ts` | Tested by `tests/api/disputes.test.ts`, `tests/api/admin-disputes.test.ts` |
| 5.15 | COMPLAINT_FILED → REFUNDED (admin force refund) | ✅ | `src/lib/order-state.ts` | Extra admin force-refund transitions from kitchen statuses (DECISIONS P11). Tested by `tests/api/admin-disputes.test.ts` |
| 5.16 | `OrderEvent` records every transition (from, to, actor, timestamp) | ✅ | `src/server/orders/changeStatus.ts`, `src/server/orders/checkout.ts` (creation event) | DECISIONS P02/P05/P06. Tested by `tests/order-change-status.test.ts`, `tests/api/customer-orders.test.ts` |
| 5.17 | OrderEvent "powers the tracking timeline" | ✅ | `src/lib/order-tracking.ts`, `src/components/orders/OrderTimeline.tsx` | Tested by `src/lib/order-tracking.test.ts` |
| 5.18 | Partial refund sets paymentStatus `PARTIALLY_REFUNDED` | ✅ | `src/server/disputes/respond.ts`, `src/server/admin/disputes.ts` | DECISIONS P09. Tested by `tests/api/disputes.test.ts` |
| 5.19 | Order → `REFUNDED` only if fully refunded, "otherwise returns to its previous status" | ✅ | same | DECISIONS P09/P11. Tested by `tests/api/disputes.test.ts`, `tests/api/admin-disputes.test.ts` |

## §6 Disputes, refunds, reports

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 6.1 | Refund request allowed for `PLACED_PAID`/`PREPARING`/`READY_FOR_PICKUP` | ✅ | `src/server/disputes/customer.ts`, `src/app/api/orders/[orderId]/refund-request/route.ts` | Tested by `tests/api/disputes.test.ts` |
| 6.2 | Customer "selects the unavailable item(s) (or "whole order")" | ✅ | `src/components/disputes/CustomerDisputeActions.tsx` (item checkboxes + "Whole order") | Tested by `e2e/disputes.spec.ts` |
| 6.3 | … "+ reason" | ✅ | `src/components/disputes/CustomerDisputeActions.tsx` ("Reason"), `src/lib/validation/disputes.ts` | |
| 6.4 | "Refund amount = sum of selected items' `price_at_order × qty`" | ✅ | `src/server/disputes/customer.ts` (`refundAmountPaise`) | DECISIONS P09. Tested by `tests/api/disputes.test.ts` |
| 6.5 | Shop Approve → refund via `PaymentProvider.refund()` (Stripe Refunds API) | ✅ | `src/server/disputes/respond.ts`, `src/server/payments/stripe.ts` (`refunds.create`) | Claim-then-refund, idempotency key (DECISIONS P09). Tested by `tests/api/disputes.test.ts`, `src/server/payments/stripe.test.ts` |
| 6.6 | Approve → "statuses updated" | ✅ | `src/server/disputes/respond.ts` | Tested by `tests/api/disputes.test.ts` |
| 6.7 | Approve → "customer notified" | ✅ | `src/server/disputes/respond.ts` → `changeStatus` (`customerMessage`) | Tested by `tests/api/disputes.test.ts`, `e2e/disputes.spec.ts` |
| 6.8 | Reject (with reason) → complaint status `ESCALATED`, "visible to admin" | ✅ | `src/server/disputes/respond.ts`, `src/app/(admin)/admin/disputes/page.tsx` ("Escalated" tab) | Tested by `tests/api/disputes.test.ts`, `e2e/disputes.spec.ts`, `e2e/journeys.spec.ts` (4) |
| 6.9 | Complaint: "free-text complaint on any paid order" | ✅ | `src/server/disputes/customer.ts`, `src/components/disputes/CustomerDisputeActions.tsx` ("Report a problem") | Paid statuses PLACED_PAID…COMPLETED (DECISIONS P02). Tested by `tests/api/disputes.test.ts` |
| 6.10 | "shop can reply" | ✅ | `src/components/disputes/ShopDisputeActions.tsx` (Reply), `src/server/disputes/respond.ts` | DECISIONS P09. Tested by `tests/api/disputes.test.ts` |
| 6.11 | Shop can "mark resolved" | ✅ | `src/components/disputes/ShopDisputeActions.tsx` (Mark resolved) | Tested by `tests/api/disputes.test.ts`, `e2e/disputes.spec.ts` |
| 6.12 | "or admin resolves" | ✅ | `src/server/admin/disputes.ts`, `src/components/admin/AdminDisputeActions.tsx` | Tested by `tests/api/admin-disputes.test.ts` |
| 6.13 | Admin "sees all refund requests and complaints" | ✅ | `src/app/(admin)/admin/disputes/page.tsx`, `src/app/api/admin/disputes/route.ts` | DECISIONS P11. Tested by `tests/api/admin-disputes.test.ts` |
| 6.14 | … "(filter by status/shop)" | ✅ | `src/app/(admin)/admin/disputes/page.tsx` (status tabs, shop + type selects), `src/lib/validation/admin.ts` | Tested by `tests/api/admin-disputes.test.ts` (list filters) |
| 6.15 | Admin can "force a Stripe refund (full or item-level)" | ✅ | `src/components/admin/AdminDisputeActions.tsx` (Force refund, items / whole), `src/server/admin/disputes.ts` | DECISIONS P11. Tested by `tests/api/admin-disputes.test.ts`, `e2e/journeys.spec.ts` (4) |
| 6.16 | Admin can "resolve with a note" | ✅ | `src/components/admin/AdminDisputeActions.tsx` ("Resolve with note" / "Close without refund") | Tested by `tests/api/admin-disputes.test.ts` |
| 6.17 | Admin "Sees all customer reports from shops" | ✅ | `src/app/(admin)/admin/reports/page.tsx`, `src/app/api/admin/reports/route.ts` | Tested by `tests/api/admin.test.ts` |
| 6.18 | Admin can **warn** (with message) | ✅ | `src/components/admin/ModerationActions.tsx`, `src/server/admin/accounts.ts` | Sets WARNED + `warningMessage` + ACCOUNT notification (DECISIONS P11). Tested by `tests/api/admin.test.ts` |
| 6.19 | Admin can **suspend** an account | ✅ | same | Also closes sockets (DECISIONS P11). Tested by `tests/api/admin.test.ts`, `e2e/admin.spec.ts` |
| 6.20 | Admin can **reinstate** an account | ✅ | same | Tested by `tests/api/admin.test.ts`, `e2e/admin.spec.ts` |
| 6.21 | Admin "can also suspend a shop owner" | ✅ | `src/app/(admin)/admin/shops/page.tsx`, `src/app/(admin)/admin/users/page.tsx` (`ModerationActions`) | Shop hidden from browsing (DECISIONS P04/P11). Tested by `tests/api/admin.test.ts` |
| 6.22 | Admin can "Dismiss report" | ✅ | `src/components/admin/ModerationActions.tsx` ("Dismiss report"), `src/app/api/admin/reports/[id]/route.ts` | Tested by `tests/api/admin.test.ts` |
| 6.23 | Complaint `status`: `OPEN`, `ESCALATED`, `RESOLVED`, `REJECTED` | ✅ | `prisma/schema.prisma` (`ComplaintStatus`) | |
| 6.24 | Report `status`: `OPEN`, `ACTIONED`, `DISMISSED` | ✅ | `prisma/schema.prisma` (`ReportStatus`) | |

## §7 Payments

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 7.1 | Stripe Checkout Session, mode `payment` | ✅ | `src/server/payments/stripe.ts` (`mode: "payment"`) | Tested by `src/server/payments/stripe.test.ts` |
| 7.2 | … "line items from order" | ✅ | `src/server/payments/stripe.ts` (`line_items` from order items) | Tested by same |
| 7.3 | … `metadata.orderId` | ✅ | `src/server/payments/stripe.ts` | Tested by same |
| 7.4 | … success/cancel URLs | ✅ | `src/server/payments/stripe.ts` (`/checkout/success`, `/checkout/cancel`) | DECISIONS P06 |
| 7.5 | Webhook `/api/payments/stripe/webhook` verifies signature | ✅ | `src/app/api/payments/stripe/webhook/route.ts`, `src/server/payments/stripe.ts` (`parseWebhook`) | Tested by `tests/api/payments.test.ts` (real signatures, bad/missing/altered refused) |
| 7.6 | Handles `checkout.session.completed` | ✅ | `src/server/payments/stripe.ts`, `src/server/payments/webhook.ts` | Tested by `tests/api/payments.test.ts` |
| 7.7 | Handles `checkout.session.expired` | ✅ | same | Tested by same |
| 7.8 | Handles `checkout.session.async_payment_failed` | ✅ | same | Tested by same |
| 7.9 | Handles `charge.refunded` | ✅ | same + `src/server/orders/payment.ts` (refund sync) | DECISIONS P09. Tested by `tests/api/disputes.test.ts` |
| 7.10 | "Success page also retrieves the session and confirms payment" | ✅ | `src/app/(customer)/checkout/success/page.tsx` → `confirmCheckoutPayment` | Tested by `tests/api/payments.test.ts` (fake Stripe provider) |
| 7.11 | Store `stripePaymentId` (PaymentIntent id) on the order | ✅ | `prisma/schema.prisma`, `src/server/orders/payment.ts` | |
| 7.12 | Store `stripeCheckoutSessionId` on the order | ✅ | `prisma/schema.prisma` (unique), `src/server/orders/checkout.ts` | |
| 7.13 | `MockProvider`: checkout redirects to `/pay/mock/[orderId]` | ✅ | `src/server/payments/mock.ts`, `src/app/(customer)/pay/mock/[orderId]/page.tsx` | Tested by `src/server/payments/index.test.ts`, `e2e/checkout.spec.ts` |
| 7.14 | Mock page has "Pay" and "Fail" buttons | ✅ | `src/components/checkout/MockPaymentButtons.tsx` ("Pay ₹X", "Fail payment") | Tested by `e2e/checkout.spec.ts` |
| 7.15 | Mock "refunds succeed instantly" | ✅ | `src/server/payments/mock.ts` (`refund`) | Tested by `src/server/payments/index.test.ts` |
| 7.16 | Mock "Used in E2E tests and whenever no Stripe key is configured" | ✅ | `src/server/payments/index.ts` (`resolveProviderName`: auto → mock without key), `scripts/e2e.ts` | DECISIONS P06/P12. Tested by `src/server/payments/index.test.ts` |

## §8 UI/UX

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 8.1 | "Clean, minimal, mobile-first (test at 375px)" | ✅ | Tailwind mobile-first classes across `src/components/**` | Tested by 375px checks in `e2e/browsing.spec.ts`, `e2e/checkout.spec.ts`, `e2e/orders.spec.ts`, `e2e/shop-portal.spec.ts`, `e2e/admin.spec.ts`, `e2e/journeys.spec.ts` (7) |
| 8.2 | PENDING_PAYMENT grey | ✅ | `src/components/ui/StatusBadge.tsx` (`STATUS_BADGE_STYLE`) | Single definition (DECISIONS P04). Tested by `src/components/ui/StatusBadge.test.ts` |
| 8.3 | PLACED_PAID blue | ✅ | same | Tested by same |
| 8.4 | PREPARING amber | ✅ | same | Tested by same |
| 8.5 | READY_FOR_PICKUP green (pulsing dot) | ✅ | same (`pulse: true`, `animate-ping`) | Tested by same |
| 8.6 | COMPLETED slate | ✅ | same | Tested by same |
| 8.7 | PAYMENT_FAILED red | ✅ | same | Tested by same |
| 8.8 | REFUND_REQUESTED orange | ✅ | same | Tested by same |
| 8.9 | REFUNDED purple | ✅ | same | Tested by same |
| 8.10 | COMPLAINT_FILED rose | ✅ | same | Tested by same |
| 8.11 | RESOLVED teal | ✅ | same | Tested by same |
| 8.12 | Customer bottom tab bar on mobile: Shops, Orders, Notifications, Account | ✅ | `src/components/shell/CustomerShell.tsx` (`TABS`, `md:hidden` bottom nav) | Tested by `e2e/auth.spec.ts` ("mobile customer shell has a bottom tab bar") |
| 8.13 | Sidebar for shop portal | ✅ | `src/components/shell/SidebarShell.tsx`, `src/app/(shop)/shop/layout.tsx` | Mobile drawer below `md`. Tested by `e2e/auth.spec.ts` |
| 8.14 | Sidebar for admin portal | ✅ | `src/components/shell/SidebarShell.tsx`, `src/app/(admin)/admin/layout.tsx` | Tested by `e2e/auth.spec.ts` |
| 8.15 | Loading skeletons on every list page | ✅ | `loading.tsx` in `shops`, `shops/[shopId]`, `orders`, `orders/[orderId]`, `shop/menu`, `shop/orders`, `shop/orders/[orderId]`, `shop/profile`, `admin/{disputes,disputes/[id],reports,users,shops}`; client lists: `src/components/notifications/NotificationsPage.tsx`, `src/components/cart/CartView.tsx` | |
| 8.16 | Empty states on every list page | ✅ | `src/components/ui/EmptyState.tsx` used by shops, menu, reviews, orders tabs, notifications, cart, shop orders/menu, admin lists | |
| 8.17 | Error states on every list page | ✅ | `error.tsx` beside each `loading.tsx` above; `ErrorState` in `NotificationsPage.tsx`; cart shows checkout errors via `Alert` | |
| 8.18 | "Accessible labels on all controls" | ✅ | e.g. `src/components/cart/CartView.tsx`, `src/components/shops/DishCard.tsx`, `src/components/ui/Switch.tsx`, `src/components/reviews/ReviewForm.tsx`, `src/components/notifications/NotificationBell.tsx`, admin filter `<label>`s | Spot-checked icon-only buttons, switches, star picker, file inputs and selects: all labelled. ESLint `next/core-web-vitals` (jsx-a11y subset) in `eslint.config.mjs` |

## §9 Data model

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 9.1 | **User**: id, role (CUSTOMER/SHOP_OWNER/ADMIN), name, email (unique), passwordHash, phone?, status, warningMessage?, createdAt | ✅ | `prisma/schema.prisma` (`User`, `Role`) | All fields present; `updatedAt` added (DECISIONS P02) |
| 9.2 | **Shop**: id, ownerId (unique), name, description, logoUrl, location, isOpen, createdAt | ✅ | `prisma/schema.prisma` (`Shop`) | `logoUrl` is nullable but always set (placeholder logo, DECISIONS P03); `updatedAt` added (P02) |
| 9.3 | **MenuItem**: id, shopId, name, description, photoUrl, pricePaise, prepTimeMinutes, inStock, isArchived | ✅ | `prisma/schema.prisma` (`MenuItem`) | `photoUrl` nullable (photo optional, see 3.9); `createdAt`/`updatedAt` added (P02) |
| 9.4 | **Order**: id, orderNumber, customerId, shopId, status, totalPaise, paymentStatus, stripeCheckoutSessionId?, stripePaymentId?, refundedPaise, createdAt, updatedAt | ✅ | `prisma/schema.prisma` (`Order`) | `orderNumber` unique `PEC`+6 chars (DECISIONS P06); session id unique (P02) |
| 9.5 | **OrderItem**: id, orderId, menuItemId, nameAtOrder, quantity, pricePaiseAtOrder, refunded (bool) | ✅ | `prisma/schema.prisma` (`OrderItem`) | |
| 9.6 | **OrderEvent**: id, orderId, fromStatus, toStatus, actorId?, note?, createdAt | ✅ | `prisma/schema.prisma` (`OrderEvent`) | `fromStatus` nullable for the creation event (DECISIONS P02) |
| 9.7 | **Review**: id, orderId (unique), customerId, shopId, rating, comment, photos (String[]), createdAt | ✅ | `prisma/schema.prisma` (`Review`) | |
| 9.8 | **Complaint**: id, orderId, raisedById, type (REFUND/COMPLAINT), description, itemIds (String[]), refundAmountPaise?, status, resolution?, shopResponse?, createdAt, updatedAt | ✅ | `prisma/schema.prisma` (`Complaint`, `ComplaintType`) | |
| 9.9 | **CustomerReport**: id, shopId, customerId, orderId?, reason, description, status, adminNote?, createdAt | ✅ | `prisma/schema.prisma` (`CustomerReport`) | `updatedAt` added (P02) |
| 9.10 | **Notification**: id, userId, type, title, body, link, readAt?, createdAt | ✅ | `prisma/schema.prisma` (`Notification`, `NotificationType`) | `type` is an enum (DECISIONS P02) |

## §10 Seed data

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 10.1 | Admin `admin@pec.test` / `admin123` | ✅ | `prisma/seed-data.ts` (`SEED_ADMIN`, `SEED_PASSWORDS`), `prisma/seed.ts` | |
| 10.2 | 4 shops with owners `shop1@pec.test` … `shop4@pec.test` / `shop123` | ✅ | `prisma/seed-data.ts` | Tested by `tests/seed-data.test.ts` |
| 10.3 | Shop kinds: chai & snacks stall, south-Indian counter, juice bar, fast-food counter | ✅ | `prisma/seed-data.ts` (Forks n Knives Cafe, Paratha Cafe, Combo Juice Bar, Gyoza Cafe) | |
| 10.4 | "6–10 dishes each" | ✅ | `prisma/seed-data.ts` (7–10 per shop) | Tested by `tests/seed-data.test.ts` |
| 10.5 | "realistic INR prices, prep times" | ✅ | `prisma/seed-data.ts` (integer paise, e.g. Coke ₹40, 1 min) | Tested by `tests/seed-data.test.ts` |
| 10.6 | "locally generated SVG placeholder images (no network)" | ✅ | `src/lib/placeholder-svg.ts`, `prisma/seed.ts` (writes `uploads/seed/`) | DECISIONS P02. Tested by `src/lib/placeholder-svg.test.ts`, `e2e/auth.spec.ts` ("seed images are served") |
| 10.7 | Two customers `student1@pec.test`, `student2@pec.test` / `student123` | ✅ | `prisma/seed-data.ts` | Tested by `tests/seed-data.test.ts` |
| 10.8 | "a few historical orders in various states" | ✅ | `prisma/seed-data.ts` (PEC1001–PEC1008: COMPLETED, PREPARING, PLACED_PAID, PAYMENT_FAILED, REFUNDED, COMPLAINT_FILED) | Replayed through the state machine (DECISIONS P02). Tested by `tests/seed-data.test.ts` |
| 10.9 | … "and reviews" | ✅ | `prisma/seed-data.ts` (3 reviews, one with a photo) | Tested by `tests/seed-data.test.ts` |

## §11 Assumptions

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| 11.1 | "Multiple shops can register (marketplace)" | ✅ | `src/app/(auth)/shop/signup/page.tsx`, `src/server/auth/service.ts` | Tested by `tests/api/signup.test.ts` |
| 11.2 | "Basic admin/moderator layer included" | ✅ | `src/app/(admin)/admin/**`, `src/app/api/admin/**` | Tested by `tests/api/admin.test.ts`, `tests/api/admin-disputes.test.ts`, `e2e/admin.spec.ts` |
| 11.3 | "Reviews only after Completed" | ✅ | `src/server/reviews/reviews.ts` | Same as 3.40 |
| 11.4 | "Real-time sync is required — no refresh-to-check" | ✅ | Live: `src/app/(customer)/shops/page.tsx` (P13: `LiveRefresh` on the `shops:all` room), `src/app/(customer)/shops/[shopId]/page.tsx`, `src/app/(customer)/orders/**`, `src/app/(shop)/shop/**`, `src/app/(admin)/admin/{page,disputes,reports}`, notifications provider; routing in `src/server/realtime/emit.ts` | Fixed in P13 (was ⚠️: the shops list needed a reload to see open/closed or rating changes). Tested by `tests/realtime.test.ts`, `src/lib/order-status.test.ts`, `e2e/realtime.spec.ts` ("a shop closing and reopening shows up live on a customer's open shops list") |

## Non-functional requirements (from §2, §8, §11)

| # | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| NF.1 | Mobile-first, 375px | ✅ | see 8.1 | |
| NF.2 | Accessibility (labels on all controls) | ✅ | see 8.18 | |
| NF.3 | Security: hashed passwords, httpOnly JWT, role gating, suspended users blocked | ✅ | `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/proxy.ts`, `src/server/auth/guards.ts`; extra hardening in `src/server/auth/rate-limit.ts`, `src/lib/portals.ts` (`safeNextPath`), upload sniffing in `src/server/storage/image.ts` | DECISIONS P03/P12. Tested by `tests/api/guards.test.ts`, `tests/proxy.test.ts`, `tests/api/login-rate-limit.test.ts`, `tests/api/uploads.test.ts`, `tests/api/shop-ownership.test.ts` |
| NF.4 | Webhook trust: signature verified before anything is read | ✅ | `src/app/api/payments/stripe/webhook/route.ts` | DECISIONS P06 |
| NF.5 | Performance | ✅ | n/a | SPEC states no performance targets; live updates measured within 3–5 s in `e2e/realtime.spec.ts` / `e2e/journeys.spec.ts` |

---

## Counts

| Status | Rows |
|---|---|
| ✅ Implemented | 207 |
| ⚠️ Partial | 0 |
| ❌ Missing | 0 |

## Gaps

None open. Every SPEC requirement is implemented.

## Gaps (resolved)

1. **Resolved in P13 — 11.4 — Customer shops list is not real-time (⚠️ Partial).** `src/app/(customer)/shops/page.tsx` renders shop
   open/closed status and average rating server-side with no `LiveRefresh`, and `roomsFor` in
   `src/server/realtime/emit.ts` sends `shop:updated` / `shop:review` only to `menu:<shopId>` and `shop:<shopId>`, so a
   customer on `/shops` sees a shop open/close or a new rating only after reloading (SPEC §11 "no refresh-to-check").
   **Fix:** (a) in `src/server/realtime/emit.ts` `roomsFor`, also deliver `shop:updated` and `shop:review` to a new
   `shops` room (and any new/suspended-shop change if desired); (b) in `src/server/realtime/server.ts` (and the zod
   subscribe schema in `src/lib/realtime/protocol.ts`) allow `subscribe { kind: "shops" }` for any signed-in user
   (or auto-join customers to `shops`); (c) add
   `<LiveRefresh on={["shop:updated", "shop:review"]} subscribe={{ kind: "shops" }} />` to
   `src/app/(customer)/shops/page.tsx` (extend `LiveRefresh`'s subscribe type if needed); (d) add a case to
   `tests/realtime.test.ts` and an assertion in `e2e/realtime.spec.ts` (shop closes → list pill shows "Closed"
   without reload).

   **Done:** `shops:all` room (subscribe `{ kind: "shops", id: "all" }`, any signed-in user), `shop:updated` and
   `shop:review` routed there too, `LiveRefresh` on `/shops`, plus unit, socket and E2E tests.

Minor note (not a gap): dish photos are optional on create/edit (`src/server/shops/menu.ts`,
`src/components/shop/DishForm.tsx`; a placeholder icon is shown) and `Shop.logoUrl` / `MenuItem.photoUrl` are
nullable in `prisma/schema.prisma`. Recorded in `docs/DECISIONS.md` (P03 for logos, P13 for dish photos).
