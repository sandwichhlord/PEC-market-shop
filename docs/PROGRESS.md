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
- **P08 (2026-11-14), same cause:** host CPU 45–91% during the session (VS Code plus another project's Docker stack).
  `npm run verify` passes (482 tests). Six full `npm run e2e` runs; the first four were fixing real issues
  (server-start crash, too-strict assertions, mark-read cancelled by a reload). The best run (run 5) passed 33 of 35:
  all 3 `e2e/realtime.spec.ts` tests passed, including the two-context "start preparing → customer sees PREPARING
  within 3 s" and the live stock toggle. The 2 failures were a login redirect and a mock payment that each took longer
  than the 5 s expect timeout. Run 6 started at 91 % CPU and failed 9+ specs at login and checkout steps (a Prisma
  transaction even exceeded its 5 s limit). Every spec has passed in at least one run.
  **Needs a human:** re-run `npm run e2e` on an idle machine to confirm a fully green run.
- **P09 (2026-11-14):** same host contention; another project's testcontainers run overlapped one E2E run, and
  `/api/health` even reported `db: false` mid-run. On the rerun after it finished, both new `e2e/disputes.spec.ts`
  tests passed; the failures were slow login, signup and payment steps, plus a hidden streamed-page duplicate in
  `orders.spec.ts`'s card locator (now fixed with `visible: true`). `npm run verify` passes.
- **P10 (2026-11-15):** host at 99% CPU (VS Code, a game, and another project's ledgerpay Docker stack with Kafka).
  The full `npm run e2e` run had 19 passing; the failures were "Connection terminated due to connection timeout" from
  Postgres and login redirects past 5 s, in specs P10 does not touch. Run alone, the new `e2e/reviews.spec.ts` passed
  (its login wait is 20 s because the Log in request alone took over 5 s). `npm run verify` passes.
  **Needs a human:** re-run `npm run e2e` on an idle machine.
- **Resolved (P12, 2026-11-15):** on an idle host, the full `npm run e2e` suite (48 tests) passed twice in a row and
  `npm run verify` passed. The earlier failures were host load.

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

## P08 — Real-time sync & notifications (2026-11-14)

**Built:** Socket.IO handshake auth (`src/server/realtime/server.ts`, attached in `server.ts`). It checks the
session cookie, refuses anonymous, stale and suspended users, and auto-joins `user:` plus `shop:` (owners) or
`admin`. Pages subscribe to `order:` and `menu:` rooms through an acked, zod-validated `subscribe`/`unsubscribe`
protocol, with the same access rules as the API. The Next-free auth helpers (`loadSessionUser`, `orderAccessFor`)
moved to `src/server/auth/access.ts`, because `server.ts` loads them before Next starts. `emit()` now also routes
dispute changes to `admin` and pushes `notification:new` to `user:`; `changeStatus` emits every created Notification
row after commit. API: `GET /api/notifications` (50 newest + unread count) and `POST /api/notifications/read`
(`{ids}` or `{all:true}`, own rows only). Client: shared socket with reference-counted subscriptions that are re-sent
on reconnect, and a `useSocket` hook (event handlers, room, `onReconnect` refetch). `LiveRefresh` re-renders server
pages on matching events and after reconnects: customer order page and list, customer shop menu, shop
dashboard/orders/order detail, admin dashboard. The shop `MenuManager` applies stock and archive events locally.
`NotificationsProvider` in every portal shell drives the bell (unread badge, latest 10, mark read, mark all read,
"See all" for customers), the customer's Notifications tab badge, a live `/notifications` page and toasts. Mark-read
requests use `keepalive`, so navigating or reloading doesn't cancel them. The socket closes when the shell unmounts
(logout).

**Verified:** `npm run verify` passes (482 Vitest tests; 22 new). `tests/realtime.test.ts` runs a real Socket.IO
server with socket.io-client sessions. It covers: refusal of missing/tampered cookies, suspended users and stale
roles; home rooms per role; order subscriptions (own order yes, other customer no, own shop paid yes / unpaid no,
other shop no, admin yes); menu subscriptions (visible shop yes, suspended owner / unknown / bad input no,
unsubscribe leaves). It also checks delivery: a kitchen update reaches the customer (status + notification with the
stored id), the order room and the shop, but not admin or strangers; a new paid order reaches the shop room with
NEW_ORDER; disputes reach admin with a DISPUTE note for the shop; stock toggles reach menu watchers and the shop
only. `tests/api/notifications.test.ts` covers list order, unread count, the 50 cap, every role, mark ids / all,
keeping the original readAt, other users' rows untouched, validation and 401/403. `roomsFor` unit tests cover admin
routing for disputes and notifications. New `e2e/realtime.spec.ts` uses two browser contexts: a new paid order
appears on the shop's open dashboard with a toast; the shop's "start preparing" shows PREPARING on the customer's
open order page within 3 s with no reload; a toast appears and the bell gets an unread count; ready-for-pickup
arrives live; mark all read persists after a reload. It also covers a stock toggle reflected live on the customer's
open menu (and back), and a shop menu tab following another tab. All passed (run 5). `npm run e2e` has not had a
fully green run on this loaded host (see Blocked).

**Deferred by plan:** report events to the admin room (P11, when reports can be created), dispute response UI (P09).

## P09 — Refunds & complaints (2026-11-14)

**Built:**
- **Customer:** "Request a refund" on the order page (sheet with item checkboxes or whole order, live refund amount,
  reason) and "Report a problem" (complaint text), plus a "Refunds & complaints" list showing status, items, amount,
  the shop's response and the resolution.
- **API:** `POST /api/orders/[orderId]/refund-request` and `/complaints` (the order's customer only).
- **Shop:** order page dispute cards with Approve refund (₹X) / Reject (reason) for refund requests, and Reply /
  Mark resolved (optional note) for complaints, through `POST /api/shops/[shopId]/disputes/[complaintId]`.
- **Service:** `src/server/disputes/` (customer.ts, respond.ts). Approve claims the request (no double refund),
  refunds through `PaymentProvider.refund()` with an idempotency key, marks items refunded and raises
  `refundedPaise`. The result is REFUNDED / REFUNDED when everything is refunded, otherwise the order resumes its
  previous status with PARTIALLY_REFUNDED. Reject escalates to the admin (ESCALATED) and the order resumes. A
  provider failure un-claims the request (502).
- **changeStatus:** gained `inTransaction` (complaint rows commit together with the status change) and
  `customerMessage` (partial refund / rejection / resolution texts).
- **Stripe `charge.refunded`:** now syncs `refundedPaise` / paymentStatus for refunds made outside the app; the
  echo of the app's own refunds is a no-op.
- **Seed and fixtures:** paid seed orders and test fixtures carry a placeholder payment id so they can be refunded
  with the mock provider.

**Verified:** `npm run verify` passes (505 Vitest tests; 23 new in `tests/api/disputes.test.ts`):
- full refund (provider called once with the right amount and idempotency key; items, refundedPaise, statuses,
  complaint and customer notification checked);
- partial refund (resumes PREPARING, PARTIALLY_REFUNDED, then the remainder → REFUNDED);
- double approve and racing approves → one refund;
- refund can't exceed what is still refundable (409, provider not called, request stays open);
- provider failure → 502 and the request can be retried;
- rejection → ESCALATED, order resumes, customer told the reason, repeat reject is a no-op, approve after reject 409;
- partial-then-reject keeps PARTIALLY_REFUNDED;
- complaint file → reply (notification) → resolve (order RESOLVED), repeat resolve no-op, reply to a closed
  complaint 409;
- request/complaint status rules, already-refunded and foreign items, validation, and wrong dispute types;
- authorization: other customer 404, shop/admin 403, other shop 403/404;
- `charge.refunded`: external partial then full, echo/replay no-op, pending request keeps REFUND_REQUESTED, capped
  at the total, unknown payment acknowledged.

New `e2e/disputes.spec.ts` (two contexts: partial refund approved and seen live by the customer, with only the
remaining item offered next; reject → admin, then complaint → reply toast → resolved) passed (see Blocked for the
loaded full-suite runs).

**Deferred by plan:** admin disputes queue / force refund / resolve with note (P11), which reuses the escalated
requests created here.

## P10 — Reviews (2026-11-15)

**Built:**
- `POST /api/orders/[orderId]/review` (multipart: rating 1–5, comment ≤1000, up to 3 photos sniffed as images) →
  `createReview` in `src/server/reviews/reviews.ts`: COMPLETED only, one per order (race-safe via the unique
  `orderId`), photos stored under `uploads/reviews/` and cleaned up if the insert fails; emits `shop:review` with the
  new average.
- `GET /api/shops/[shopId]/reviews` (newest first, `?limit=`), plus `shopRating()` / `isBrowsableShop()` helpers.
- Customer order page: review form (star picker, comment with counter, photo picker with previews/remove) when
  COMPLETED and not yet reviewed; "Your review" card afterwards. Shop page: Reviews section with average
  ("4.3 out of 5 · 3 reviews"), stars, reviewer, date, comment, photos; empty state. Shop order page shows the
  customer's review live. New `Stars` and `ReviewCard` components.

**Verified:**
- `npm run verify` passes (530 Vitest tests; 25 new in `tests/api/reviews.test.ts`): create with photos/comment and the
  broadcast payload; stars-only; blocked before COMPLETED (7 statuses + 2 unpaid); second review blocked; racing
  duplicates → one row; other user's order 404; shop owner/admin 403; no session 401 / suspended 403; validation
  (missing/0/6/fractional/text rating, long comment); >3 photos, non-image, text part refused; empty browser file part
  ignored; average updates per review (5, 4.5, 4.3) and is unaffected by another shop's review; list order, `limit`,
  auth and hidden-shop 404.
- New `e2e/reviews.spec.ts` (customer orders → shop completes → form appears live → no-star submit refused → 3★ with
  comment and photo → shop's order page shows it live → shop page average 4.5 → 4.0, newest review first) passed.

**Notes:** one of three `npm run verify` runs failed an untouched P06 checkout test (a checkout transaction hit an FK
error mid-transaction while the host was at 99% CPU); the other two runs were fully green. See Blocked for the full
E2E run.

## P11 — Customer reports & admin portal (2026-11-15)

**Built:**
- **Shop → admin reports:** "Report customer" on the shop's order page (reason No show / Misbehaviour / Other +
  description). `POST/GET /api/shops/[shopId]/orders/[orderId]/report`. One open report per order. Every admin gets
  a notification plus a live `report:changed` push.
- **Admin portal** (sidebar: Dashboard, Disputes, Reports, Users, Shops), each page with loading / error / empty
  states:
  - *Dashboard:* 8 live counts, each linking to the filtered list. Escalated disputes and open reports are
    highlighted.
  - *Disputes:* queue with status tabs plus shop and type filters. Detail page shows the claim, items, payment and
    timeline, with **Force refund** (chosen items or everything left) and **Resolve / close with note**.
  - *Reports:* queue with warn (message), suspend, reinstate and dismiss, plus an optional admin note. Shows the
    customer's status and how often they have been reported.
  - *Users:* search by name/email/phone with role and status filters, and the same account actions.
  - *Shops:* every shop with owner status, rating, paid-order / dish / open-dispute counts, and owner actions.
- **APIs** under `/api/admin/{stats,disputes,disputes/[id],reports,reports/[id],users,users/[id],shops}`, all
  `requireRole("ADMIN")` + zod.
- **State machine:** admin may force-refund from PLACED_PAID / PREPARING / READY_FOR_PICKUP / COMPLETED → REFUNDED,
  for escalated disputes whose order has resumed. `changeStatus` gained `shopMessage`.
- **Suspension:** closes the user's sockets right away. Their next API call or page load logs them out (existing
  guards and layouts).

**Verified:**
- `npm run verify` passes: 573 Vitest tests, 36 new in `tests/api/admin.test.ts` and
  `tests/api/admin-disputes.test.ts` (written by a subagent), plus new state-machine cases. They cover:
  - 401 / 403 on all 9 admin routes for no session, customers, shop owners and suspended admins;
  - shop reports: notifications, duplicate, 404 / 403, validation;
  - every report action, including repeats and closed reports;
  - every user action on customers and shop owners: hidden shop, ADMIN_ACCOUNT, filters;
  - a suspended user is rejected with the cookie cleared on the next request, and works again after reinstate;
  - stats;
  - force refund full / partial and resolve on OPEN and ESCALATED refund requests and on complaints, double and
    racing refunds (one provider call), ALREADY_REFUNDED, foreign items, provider failure → 502 and retry,
    ORDER_IN_DISPUTE, list filters and detail.
- **Bug the tests caught and I fixed:** an admin refund on an escalated dispute was issued at the provider but not
  recorded if the shop moved the order mid-call. Recording now re-reads the order and retries against its current
  status.
- New `e2e/admin.spec.ts` passed on the first try (no retries): fresh customer orders → shop reports them → admin
  suspends from the reports queue with a note → Actioned tab shows SUSPENDED → customer's next page load goes to
  `/login?reason=suspended` → admin reinstates from Users → customer can log in again; and every admin page plus a
  dispute detail fits 375px with no sideways scroll.

**Not run:** the full `npm run e2e` suite (the host is still under the load recorded in Blocked). P12 owns the full
E2E pass, including the admin force-refund scenario.

## P12 — End-to-end test suite & security pass (2026-11-15)

**Built:**
- **E2E journeys** (`e2e/journeys.spec.ts`). Each journey signs up its own customer and uses shop 4:
  1. golden path: signup → browse → cart → mock pay → shop works the order from its dashboard (live PREPARING /
     READY / COMPLETED on the customer's page) → review → shop page lists it → order under Past;
  2. a failed payment keeps the cart, the retry succeeds, and history shows the PAYMENT_FAILED attempt;
  3. whole-order refund request → shop approves → the customer sees REFUNDED live;
  4. shop rejects → escalated → admin force-refunds from the disputes queue → customer and shop see REFUNDED live;
  5. shop reports a customer → admin suspends → the customer is logged out on the next page, the old cookie gets
     403 ACCOUNT_SUSPENDED from `/api/me`, and login is refused;
  6. role-gating: signed-out users go to each portal's login with `next`; every role is bounced from the other
     portals and from auth pages; wrong-role APIs give 401/403;
  7. the mobile (375 px) golden path with no sideways scroll at each step, plus the bottom tabs.

  Live assertions first wait for the acting side to show its own change, then give the other side 5 s.
- **API audit** (subagent, all 37 routes): no missing guards, roles or ownership scoping. Fixed:
  - **open redirect:** `safeNextPath` now resolves with the URL parser and requires the same origin
    (`/\t/evil.com` used to pass);
  - **logout:** `GET /api/auth/logout` validates its query with zod and ignores cross-site requests;
  - **upload size:** multipart bodies are capped while streaming (`readForm` `maxBytes`), so a 413 comes back even
    without a Content-Length;
  - **upload roles:** `POST /api/uploads` is limited per folder by role.
- **Login rate limit** (`src/server/auth/rate-limit.ts`, in memory). Only failed logins count: 5 per account+IP, 20
  per account and 30 per IP in 15 min, then 429 TOO_MANY_ATTEMPTS + `Retry-After`. `server.ts` takes the client IP
  from the socket unless `TRUST_PROXY=true`.
- The server logs the active payment provider and warns when mock payments run in production.
- **Robustness:**
  - the pg pool keeps idle connections for 5 min with TCP keep-alive;
  - E2E/Vitest DB setup retries on connection errors;
  - the streamed-page locators that remained in `checkout`, `admin` and `shop-portal` specs now use
    `filter({ visible: true })` (DECISIONS P08).

**Verified:**
- `npm run verify` passes: 595 Vitest tests. New: rate limiter unit tests, login rate-limit API tests (lockout,
  other client still allowed, reset on success, IP spraying, wrong portal not counted), open-redirect cases, logout
  cross-site, upload role matrix, streamed oversize body.
- `npm run e2e` (48 tests) passed **twice in a row** on an idle host (48/48, then 48/48). Earlier back-to-back attempts each failed one test, on a hidden streamed duplicate (fixed with the visible filter) or on a wrong radio label in the new spec (fixed).
- Earlier runs this session were on a host saturated by another project's Docker stack, and failed only on Postgres
  connection timeouts. Those runs led to the timing changes above.
