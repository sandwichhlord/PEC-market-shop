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
