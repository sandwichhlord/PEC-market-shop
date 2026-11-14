# Build plan

One phase per Claude Code session. Do the **first unchecked phase**, meet every acceptance criterion,
then follow the end-of-phase checklist in `CLAUDE.md`. Phases are grouped into the four Scrum sprints
from the course brief so the git history maps onto the SDLC section of the report.

---

## Sprint 1 — Architecture & Auth

- [x] **P01 — Scaffold & tooling**
  - The directory is not empty. Do **not** overwrite `CLAUDE.md`, `docs/`, `.claude/`, `autorun.sh`, `setup.sh`,
    `docker-compose.yml`, `.env`, `.gitignore`. Scaffold Next.js manually or in a temp dir and merge.
  - Next.js (App Router, TS strict, `src/` dir), Tailwind, ESLint, Vitest, Playwright (chromium), Prisma, `zod`, `jose`,
    `bcryptjs`, `socket.io`, `socket.io-client`, `zustand`, `lucide-react`, `stripe`, `tsx`.
  - `server.ts`: custom HTTP server hosting Next + Socket.IO; `globalThis.io` set.
  - All npm scripts listed in `CLAUDE.md`. `.env.example` mirrors `.env` keys with blank secrets.
  - `GET /api/health` returns `{ ok: true, db: true|false }`.
  - **Accept:** `npm run verify` passes; starting the server and curling `/api/health` returns ok with `db: true`;
    a trivial Vitest test and a trivial Playwright test (home page loads) pass.

- [x] **P02 — Data model, state machine, seed**
  - Full Prisma schema from SPEC §9 with all enums. First migration.
  - `src/lib/order-state.ts`: transition table from SPEC §5, `canTransition(from, to, actorRole)`, typed errors.
  - Seed script per SPEC §10 (SVG placeholders generated into `uploads/seed/`). The seed must be **idempotent**:
    running it twice on the same DB must not duplicate or fail (upsert by unique keys, or skip if already seeded).
  - Create the first migration with `npx prisma migrate dev --name init` (the dev DB `pec_market` is empty, so this
    needs no reset). If Prisma ever asks to reset the dev DB, stop and record it under "Blocked / needs human".
  - **Accept:** `npm run db:migrate` + `npm run db:seed` run cleanly on the dev DB, and `npm run db:seed` run a second
    time succeeds without duplicating rows; `npm run e2e` passes (its global setup applies the migration with
    `migrate deploy`, truncates and seeds `pec_market_e2e`); unit tests cover **every** allowed transition and at least
    10 disallowed ones (incl. wrong actor); `npm run verify` passes. Do **not** run `npm run db:reset` (human-only).

- [ ] **P03 — Auth, roles, guards, storage**
  - Customer and shop-owner signup/login pages + admin login (SPEC §2). Shop signup also creates the Shop (logo upload).
  - JWT cookie, logout, `/api/me`. Middleware redirects by role; guards in `src/server/auth/guards.ts`.
  - Suspended → blocked everywhere; warned → banner.
  - `StorageProvider` + `LocalStorageProvider` + `/api/uploads/[...path]` (image types only, ≤5 MB).
  - App shells: customer (bottom tabs on mobile), shop (sidebar), admin (sidebar).
  - **Accept:** integration tests for signup, login, wrong-portal login, suspended login, role-gated route access
    (customer → /shop = redirected, etc.); `npm run verify` passes.

## Sprint 2 — Core Portals

- [ ] **P04 — Customer browsing**
  - Shops list (search, rating, open/closed), shop menu page (photo, price, prep time, stock badge), dish detail sheet.
  - `StatusBadge` component with all colours from SPEC §8. Skeleton, empty and error states.
  - **Accept:** pages render seeded data at 375px and 1280px without layout breakage (Playwright screenshot test at both
    widths); out-of-stock dishes cannot be added; `npm run verify` passes.

- [ ] **P05 — Shop portal: menu, stock, profile, orders dashboard (non-live)**
  - Menu CRUD with photo upload, soft-delete if referenced by orders, stock toggle, shop profile edit + open/closed.
  - Orders dashboard (list + detail) with filters, and status-action buttons wired to `changeStatus` (live push comes in P08).
  - Ownership enforced: a shop owner can never read or modify another shop's data (tests).
  - **Accept:** integration tests for CRUD, ownership denial, and every shop-side status transition (valid + invalid);
    `npm run verify` passes.

## Sprint 3 — Order Flow & Payments

- [ ] **P06 — Cart, checkout, payment providers**
  - Zustand cart (one shop at a time, clear-cart confirm). Checkout API: re-validate stock/price/open shop, create order
    `PENDING_PAYMENT` with item snapshots, create checkout via provider.
  - `PaymentProvider` interface, `StripeProvider`, `MockProvider` + `/pay/mock/[orderId]` page, provider selection by env.
  - Stripe webhook (signature-verified) + success-page verification; `markOrderPaid()` is idempotent.
  - Cancel/fail path → `PAYMENT_FAILED`, cart kept.
  - **Accept:** integration tests: checkout rejects out-of-stock/closed shop/tampered price; mock pay → `PLACED_PAID`;
    calling `markOrderPaid` twice is a no-op; webhook rejects bad signature; Stripe provider unit-tested with the Stripe
    SDK mocked; `npm run verify` passes.

- [ ] **P07 — Order lifecycle & history**
  - `src/server/orders/changeStatus.ts`: single entry point — validates via state machine, writes `OrderEvent`,
    creates `Notification` rows, calls an `emit()` hook (no-op until P08).
  - Customer order detail page with status timeline from `OrderEvent`s and estimated ready time; order history with
    Active/Past tabs.
  - **Accept:** full lifecycle integration test PLACED_PAID → … → COMPLETED creates 3 events and 3 notifications for the
    customer; customer cannot see others' orders; `npm run verify` passes.

## Sprint 4 — Real-time & Admin

- [ ] **P08 — Real-time sync & notifications**
  - Socket.IO auth from the JWT cookie on handshake; join `user:`, `shop:` (owners), `order:` (on order page), `admin` rooms.
  - `emit()` implemented: order status → customer + order room; new paid order → shop room; stock toggle → public
    `menu:<shopId>` room; dispute/report events → admin room. `useSocket` hook with reconnect + refetch on reconnect.
  - Notification bell (unread count, list, mark read/all), live toasts. Shop dashboard and menu stock update live.
  - **Accept:** Playwright test with **two browser contexts** (customer + shop): shop clicks "start preparing" and the
    customer's page shows PREPARING within 3 s without reload; stock toggle reflects live on an open menu page;
    `npm run verify` and `npm run e2e` pass.

- [ ] **P09 — Refunds & complaints**
  - Customer: request refund (choose items / whole order + reason) and file complaint (SPEC §6).
  - Shop: approve (provider refund, partial or full) / reject (escalates) / reply & resolve complaints.
  - Payment status updates incl. `PARTIALLY_REFUNDED`; Stripe `charge.refunded` webhook kept consistent.
  - **Accept:** integration tests for full refund, partial refund, rejection → escalation, complaint resolve, refund
    amount can't exceed paid amount, double-approve is a no-op; `npm run verify` passes.

- [ ] **P10 — Reviews**
  - Review form (stars, text, up to 3 photos) only on `COMPLETED` orders, one per order; shop page shows reviews + average.
  - **Accept:** tests: review blocked before COMPLETED, second review blocked, other user's order blocked, average
    updates; `npm run verify` passes.

- [ ] **P11 — Customer reports & admin portal**
  - Shop: report customer from an order (reason + description).
  - Admin: dashboard counts; disputes queue (filter, force refund full/items, resolve with note); reports queue
    (warn with message / suspend / reinstate / dismiss); users list with search and status actions; shops list.
  - **Accept:** integration tests for every admin action and that non-admins get 403; suspended user is logged out on
    next request; `npm run verify` passes.

## Hardening & delivery

- [ ] **P12 — End-to-end test suite & security pass**
  - Playwright E2E (mock payments, fresh `pec_market_e2e` DB): (1) golden path signup → order → pay → live status →
    complete → review; (2) payment fail then retry; (3) refund request → shop approves → customer sees REFUNDED live;
    (4) shop rejects → admin force refund; (5) shop reports customer → admin suspends → customer blocked;
    (6) role-gating across portals; (7) mobile viewport golden path.
  - Audit every API route for a guard + zod validation + ownership check; fix gaps. Rate-limit login (simple in-memory).
  - **Accept:** `npm run verify` and `npm run e2e` pass twice in a row (no flakes).

- [ ] **P13 — Polish, docs, and spec audit**
  - Launch a **subagent** to compare `docs/SPEC.md` line by line against the implementation and write
    `docs/SPEC_AUDIT.md` (requirement → status → file). Fix every gap it finds.
  - UI polish pass at 375px and 1280px (consistent spacing, focus states, empty/error states).
  - `README.md`: setup, env vars, demo accounts, how to enable real Stripe test mode + `stripe listen`, scripts.
  - `docs/ARCHITECTURE.md`: Mermaid ER diagram, order state diagram, payment sequence diagram, real-time room design.
  - `docs/SDLC.md`: Agile/Scrum write-up mapping sprints → phases → commits (from `git log`), plus test summary.
  - **Accept:** SPEC_AUDIT shows no unimplemented requirement; `npm run verify` and `npm run e2e` pass; README steps
    work from a clean clone (verify by following them in a temp directory against the e2e DB).
