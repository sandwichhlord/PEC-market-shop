# Progress log

Append one entry per phase (newest at the bottom).

## Blocked / needs human
_(nothing yet)_

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
