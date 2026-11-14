# Progress log

Append one entry per phase (newest at the bottom).

## Blocked / needs human
- **E2E flakiness from host load (P06, 2026-11-14):** while P06 was verified, this machine sat at 85–100% CPU (other
  desktop apps running). Postgres connection handshakes through Docker's port proxy then exceed the pg 10 s connect
  timeout ("Connection terminated due to connection timeout") and cold-server logins exceed Playwright's 5 s expect, so
  random specs (old and new) fail. Please re-run `npm run e2e` on an idle machine; every spec has passed in at least
  one run. `npm run verify` passes.
- **Same symptom during P07 (2026-11-14):** another project's Docker stack (ledgerpay + Kafka + a testcontainers run)
  was running on this machine. Vitest hit pg connection timeouts in untouched test files until that run ended, after
  which `npm run verify` passed cleanly. Two `npm run e2e` runs: run 1 had 30/32 passing, run 2 had 18/32 passing, and
  every failure was a login or signup redirect timing out (5 s) while the host was slow. Every spec passed in at least
  one run, including all 4 new `e2e/orders.spec.ts` tests. Please re-run `npm run e2e` on an idle machine.

---

## P01 — Scaffold & tooling (2026-11-14)

**Built:** Next.js 16.4 (App Router, TS strict, `src/`), Tailwind 4, ESLint 9 flat config (next core-web-vitals +
typescript), Vitest 5, Playwright (chromium), Prisma 7.10 (`prisma.config.ts`, pg driver adapter, client in
`src/server/db.ts`), zod, jose, bcryptjs, socket.io (+client), zustand, lucide-react, stripe, tsx. `server.ts` hosts
Next and Socket.IO on one port with `globalThis.io` (typed in `src/server/realtime/io.ts`). `GET /api/health` →
`{ ok, db }`. `formatPaise` helper in `src/lib/money.ts`. All npm scripts from CLAUDE.md, `.env.example`,
`scripts/e2e.ts`. Prisma schema and seed are placeholders until P02.

**Verified:** `npm run verify` passes (typecheck, lint, 4 Vitest tests, `next build`). `npm run dev` + curl
`/api/health` → `{"ok":true,"db":true}`; the Socket.IO polling handshake answers on the same port; home page 200.
`npm run e2e` (user consented to the e2e DB reset) → 2/2 Playwright tests pass (home page loads; health reports
`db: true`).

**Follow-up (same day):** E2E DB prep moved out of `prisma migrate reset` into a Playwright global setup
(migrate deploy → TRUNCATE all app tables → seed) with a hard `*_e2e` database-name guard (see DECISIONS.md).
Verified: `npm run e2e` → 2/2 pass; TRUNCATE path checked on throwaway tables in `pec_market_e2e` (rows cleared
incl. FK child via CASCADE, identity restarted at 1); pointing `E2E_DATABASE_URL` at `pec_market` is refused by
both `scripts/e2e.ts` and global setup before any DB access; 7 new guard unit tests.

## P02 — Data model, state machine, seed (2026-11-14)

**Built:** Full Prisma schema for SPEC §9 (User, Shop, MenuItem, Order, OrderItem, OrderEvent, Review, Complaint,
CustomerReport, Notification + enums Role, AccountStatus, OrderStatus, PaymentStatus, ComplaintType, ComplaintStatus,
ReportReason, ReportStatus, NotificationType); first migration `20261114130514_init` via `prisma migrate dev --name init`.
`src/lib/order-state.ts`: SPEC §5 transition table, `canTransition` / `checkTransition` / `transition` /
`allowedTargets`, typed errors (`InvalidTransitionError` 409, `ForbiddenTransitionError` 403). Seed (`prisma/seed.ts` +
`prisma/seed-data.ts`): admin, 4 shop owners + shops (chai stall, dosa corner, juice bar, fast food; 7–10 dishes each,
two out of stock), 2 customers, 8 historical orders (COMPLETED ×2+1, PREPARING, PLACED_PAID, PAYMENT_FAILED,
REFUNDED with resolved refund request, COMPLAINT_FILED with open complaint), 3 reviews, events, notifications, one
open customer report. 38 SVG placeholders generated locally into `uploads/seed/`.

**Verified:** `npm run db:migrate` applied cleanly; `npm run db:seed` run twice on dev DB → identical counts both
times (7 users, 4 shops, 34 dishes, 8 orders, 13 order items, 32 events, 29 notifications, 3 reviews, 2 complaints,
1 report; second run "0 new orders"). Unit tests: every allowed (from, to, actor) — cross-checked against the table —
plus 19 not-in-table and 15 wrong-actor cases, previous-status rules, seed-data consistency, SVG generator (84 tests
total). `npm run verify` passes. `npm run e2e` passes (global setup migrate deploy + truncate + seed on `pec_market_e2e`).

## P03 — Auth, roles, guards, storage (2026-11-14)

**Built:** Email/password auth with bcryptjs + jose HS256 JWT in an httpOnly SameSite=Lax `pec_session` cookie.
API: `POST /api/auth/signup` (customer), `POST /api/auth/shop-signup` (multipart, creates owner + Shop in one
transaction, optional logo upload or generated SVG placeholder), `POST /api/auth/login` (portal-aware: `WRONG_PORTAL`
with role + link, `ACCOUNT_SUSPENDED`), `POST|GET /api/auth/logout`, `GET /api/me`. Guards in
`src/server/auth/guards.ts` (`requireUser`, `requireRole`, `requireShopOwner`, `requireOrderAccess`) with suspended
users rejected and their cookie cleared; uniform JSON errors via `withErrors` (`src/server/http.ts`). `src/proxy.ts`
(Next 16 name for middleware) redirects pages by role; portal layouts re-check the DB (suspended → logout → login
with message). `StorageProvider` + `LocalStorageProvider` (magic-byte image sniffing, ≤5 MB, traversal-safe keys),
`POST /api/uploads`, `GET /api/uploads/[...path]` (sandboxed). Pages: `/login`, `/signup`, `/shop/login`,
`/shop/signup`, `/admin/login`, public landing `/`. Shells: customer (top bar + mobile bottom tabs Shops/Orders/
Notifications/Account), shop + admin (sidebar, mobile drawer), dismissible warning banner, logout. Initial portal
pages with real data: shops list, order list, notifications list, account, shop dashboard, admin counts.

**Verified:** `npm run verify` passes (typecheck, lint, 216 Vitest tests incl. API-level integration tests against
`pec_market_test_e2e`: signup/shop signup/duplicates/validation/logo rules, login for all three portals, wrong-portal
×4, suspended login, warned login, `/api/me` with tampered/stale/suspended tokens, logout, every guard, proxy role
gating (customer → /shop redirected etc.), uploads auth/type/size/traversal; `next build`). `npm run e2e` passes
(12 Playwright tests: login/logout per portal, deep-link `next`, wrong-portal message, signups incl. logo upload,
warned banner dismiss, suspended user kicked out on next page load and blocked at login, 375px bottom tabs).

**Notes:** In this Windows environment Vitest fails with "Cannot read properties of undefined (reading 'config')"
when launched from Git Bash (drive-letter case mismatch loads two module copies); it works from PowerShell/cmd.
Deferred by plan: shop search/ratings (P04), order tabs/badges (P07), live notification bell (P08), admin actions (P11),
login rate limit (P12).

## P04 — Customer browsing (2026-11-14)

**Built:** Shops list (`/shops`) with debounced name search (`?q=`, case-insensitive, also a plain GET form), shop
cards (logo, name, location, open/closed pill, average rating to 1 decimal + review count), open shops first. Shop
menu page (`/shops/[shopId]`): header with logo/location/rating/description, closed-shop notice, dish cards (photo,
name, description, price, prep time, out-of-stock pill) and a dish detail sheet (native `<dialog>`: bottom sheet on
mobile, centred card from `sm`) with a quantity stepper. Out-of-stock dishes and dishes of closed shops are visible
but their Add buttons are disabled. Cart core: pure rules in `src/lib/cart/cart.ts` (one shop at a time, no
out-of-stock/closed adds, line cap 20) wrapped by a persisted zustand store (`src/lib/cart/store.ts`, manual
hydration); adding from a second shop opens a "Start a new cart?" confirm; a fixed cart summary bar shows count,
subtotal, shop and Clear. API: `GET /api/shops?q=` and `GET /api/shops/[shopId]` (guarded, zod-validated; shops of
suspended owners and archived dishes hidden). `StatusBadge` with every SPEC §8 colour (pulsing dot for
READY_FOR_PICKUP), now used on the orders list. UI kit additions: `Skeleton`, `ErrorState`, `Pill`, `Rating`, `Sheet`.
Loading skeletons, error boundaries (retry), empty states (no shops / no search match / no dishes) and a shop
not-found state.

**Verified:** `npm run verify` passes (236 Vitest tests; new: cart rules, StatusBadge colour map vs SPEC, API tests for
auth, ordering, search, over-long query, rating average/count, suspended-owner hiding, archived/out-of-stock menu
items, 404s). `npm run e2e` passes (19 Playwright tests; new `e2e/browsing.spec.ts`: shops list + menu + dish sheet
at 375px and 1280px with no horizontal overflow and every card inside the viewport, full-page screenshots attached
to the report; out-of-stock cannot be added (card and sheet); quantity add + cart persists across reload; search;
one-shop cart confirm (keep / clear and add); closed shop blocks adding; unknown shop not-found).

**Deferred by plan:** cart page + checkout (P06), live stock updates via Socket.IO (P08), reviews list on shop page (P10).

## P05 — Shop portal: menu, stock, profile, orders dashboard (2026-11-14)

**Built:** `src/server/orders/changeStatus.ts`, the single entry point for status changes: state-machine check,
`onlyFrom` guard, conditional update (concurrent change → 409 `ORDER_CHANGED`), `OrderEvent`, `Notification`s
(shop: new paid order / disputes; customer: every change they didn't make), then `emit()` (`src/server/realtime/emit.ts`,
already routes to `user:`/`order:`/`shop:`/`menu:` rooms; no-op without Socket.IO). Owner-only API under
`/api/shops/[shopId]/…`: menu list/create (multipart + photo), edit, delete (soft-delete/archive when the dish is
in any order), one-tap stock toggle, profile PATCH (multipart with logo, or JSON for open/closed), orders list with
Active/Completed/Disputes filters + counts, order detail, kitchen status action (PREPARING → READY_FOR_PICKUP →
COMPLETED only, never touches disputes). Every route uses `requireShopOwner` + zod, and every query is scoped by shopId.
Unpaid orders are invisible to shops. Pages: `/shop/orders` (filter tabs, cards with items×qty, customer, total,
payment status, time, status badge, next-action button; new orders highlighted), `/shop/orders/[orderId]` (items,
totals, customer, timeline, disputes read-only), `/shop/menu` (dish list, stock switch, add/edit sheet with photo,
delete confirm), `/shop/profile` (edit + open/closed switch); dashboard gets the open switch and links; sidebar nav.
Loading skeletons, error boundaries and empty states on each. New UI: `Switch`.

**Verified:** `npm run verify` passes (346 Vitest tests; 110 new: menu CRUD + validation + archive, profile,
orders filters/detail, every kitchen transition valid and all 27 invalid status×target combinations,
REFUND_REQUESTED cannot be "resumed" via the kitchen endpoint, wrong role/suspended owner, concurrent double-click
→ one 200 + one 409, ownership denial on all 9 endpoints with unchanged data, cross-shop ids → 404, direct
`changeStatus`/`notificationsFor`/`rupeesToPaise` tests, filter and room unit tests). `npm run e2e` passes (24 tests;
new `e2e/shop-portal.spec.ts`: kitchen flow PEC1007 placed → completed with timeline; add dish with photo →
customer sees it → out of stock blocks customer add → edit price → delete; profile edit + close/reopen; 375px fit;
cross-shop API 403).

**Deferred by plan:** live push to the dashboard/menu (P08 — `emit()` is in place), dispute responses on the order
page (P09), report customer (P11).

## P06 — Cart, checkout, payment providers (2026-11-14)

**Built:** `PaymentProvider` interface (`src/server/payments/`) with `StripeProvider` (Checkout Session in payment
mode with line items, `metadata.orderId`, success/cancel URLs, 30-min expiry, idempotency key; session retrieve/expire;
Refunds API; signature-verified webhook parsing) and `MockProvider` (internal `/pay/mock/[orderId]`, instant refunds),
picked by `PAYMENTS_PROVIDER` (stripe / mock / auto). Checkout (`POST /api/checkout`, `src/server/orders/checkout.ts`):
customer-only, zod-validated, re-checks shop (exists, owner not suspended, open), dishes (on menu, in stock) and prices
inside the transaction, creates a `PENDING_PAYMENT` order with item snapshots + creation event and a `PEC`+6-char order
number, then starts the provider checkout (provider failure → PAYMENT_FAILED + 502). `src/server/orders/payment.ts`:
idempotent, race-safe `markOrderPaid` (→ PLACED_PAID/PAID, shop notified via changeStatus), `markOrderPaymentFailed`,
success-page verification (`confirmCheckoutPayment`), cancel (`cancelCheckout`), mock Pay/Fail. Routes:
`POST /api/payments/mock/[orderId]` (mock provider only, order's customer only), `POST /api/payments/stripe/webhook`
(completed / async succeeded → paid; expired / async failed → failed; bad signature → 400; replays are no-ops).
Pages: `/cart` (qty −/+, remove, subtotal, clear with confirm, Pay; out-of-stock/unavailable lines flagged, changed
prices adopted), `/pay/mock/[orderId]`, `/checkout/success` (verifies with the provider, clears the cart, polls while
pending), `/checkout/cancel` (marks failed, cart kept). Header cart button with count; "View cart" on the shop page's
cart bar. Fixed `useCartHydrated` (could stay un-hydrated forever once another component hydrated the store first).

**Verified:** `npm run verify` passes (439 Vitest tests; new: 23 checkout API tests — success + snapshots, out of stock,
closed shop, tampered/stale price, archived/foreign/unknown dish, suspended owner, validation, auth/roles, 503 on
misconfiguration, provider failure; 33 payment tests — `markOrderPaid` twice/concurrently is a no-op, late success,
amount mismatch, mock pay → PLACED_PAID, mock fail → PAYMENT_FAILED, ownership/provider gating, webhook with real
Stripe signatures (bad/missing/altered signature rejected, completed → paid, replay no-op, expired/async-failed →
failed, unknown session / wrong amount acknowledged), success-page confirm and cancel with a fake Stripe provider;
21 `StripeProvider` unit tests with the Stripe SDK mocked; provider selection + `MockProvider`; `applyPrices`).
New `e2e/checkout.spec.ts` (cart → mock pay → success, cart cleared, order on the shop dashboard; fail → cart kept, not
on the shop dashboard, retry succeeds; out-of-stock refusal flagged in the cart; 375px fit): all 4 passed together in
one full `npm run e2e` run (27/28 — the one failure was a pre-existing spec's cold-start login). Later runs flaked under
host load (see Blocked).

**Deferred by plan:** customer order detail/timeline + Active/Past tabs (P07), live push (P08), `charge.refunded` and
refund flows (P09).

## P07 — Order lifecycle & history (2026-11-14)

**Built:** `changeStatus` (single entry point: state machine → OrderEvent → Notifications → `emit()` hook) was already in
place from P05; P07 builds the customer side on it. Pure tracking logic in `src/lib/order-tracking.ts`: Placed & paid →
Preparing → Ready → Completed steps (done / current / upcoming, with times) derived from OrderEvents, and the
estimated ready time (latest PREPARING event + longest dish prep time). History tabs `CUSTOMER_ORDER_TABS` (Active /
Past covering every status once). `src/server/orders/history.ts`: tab lists + counts, order detail with steps + estimate.
API: `GET /api/orders?tab=active|past` (customer only) and `GET /api/orders/[orderId]` (`requireOrderAccess`: own
customer, the shop's owner for paid orders, admin; else 404). Pages: `/orders` with Active/Past tabs (counts, cards
with shop logo, items, total, badge, time; empty states per tab), `/orders/[orderId]` (progress tracker, ready
estimate, notices for pending/failed/disputed/refunded/resolved orders, items + totals + payment status, pickup
location, full status history with who made each change), plus loading skeletons, error boundaries and a not-found
state. The checkout success page now links to "Track your order".

**Verified:** `npm run verify` passes (460 Vitest tests; 21 new): unit tests for tracking steps (unpaid, each kitchen
status, disputes/refunds, resumed orders), ready estimate (before start, ETA, re-start, ready, none outside the
kitchen) and tab coverage. API test `tests/api/customer-orders.test.ts`: the full lifecycle PLACED_PAID → PREPARING →
READY_FOR_PICKUP → COMPLETED through the shop API gives exactly 3 OrderEvents and 3 customer notifications, with the
customer's view (steps, ETA = start + 14 min, timeline) checked after every step and the order moving from Active to
Past. Access tests: another customer → 404 (and the page query returns null); another shop → 404; own shop sees paid
orders but not unpaid ones; admin 200; 401 / suspended 403 / unknown 404. Tab tests: split + order + counts, no
strangers' orders, bad tab 400, shop owner and admin 403. New `e2e/orders.spec.ts` (tabs + order; failed-payment
notice; detail tracker/estimate/timeline following the shop's ready → completed; another customer's order not found
in the page or the API; 375px fit with a screenshot): all 4 passed. Full e2e was load-affected (see Blocked).

**Deferred by plan:** live updates on the order page and toasts (P08 — `emit()` already sends to `order:`/`user:`
rooms), refund / complaint actions (P09), review form (P10).
