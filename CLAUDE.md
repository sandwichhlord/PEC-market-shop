# PEC Market — project rules for Claude Code

You are building **PEC Market**, a full-stack food-ordering web app for the market inside
Punjab Engineering College. The full requirements are in `docs/SPEC.md`. The build order is in
`docs/PLAN.md`. Progress so far is in `docs/PROGRESS.md`. Decisions you made are in `docs/DECISIONS.md`.

## You are running unattended

- This project is built by a script (`autorun.sh`) that starts a fresh Claude Code session per phase.
  **Nobody is watching and nobody will answer questions.** Never ask the user anything. Never wait for input.
- When something is ambiguous, pick the simplest option consistent with `docs/SPEC.md`, write one line
  about it in `docs/DECISIONS.md`, and keep going.
- When something is blocked (a command is denied, a download fails), work around it if you can, note it under
  "Blocked / needs human" in `docs/PROGRESS.md`, and keep going with everything else.
- Do **exactly one phase per session**: the first unchecked phase in `docs/PLAN.md`. Then stop.

## Locked tech stack (do not re-debate)

| Concern | Choice |
|---|---|
| App | Next.js (latest stable, App Router, TypeScript strict) — single app, frontend + API |
| Server | Custom `server.ts` (run with `tsx`) that hosts Next.js **and** Socket.IO on the same port |
| Styling | Tailwind CSS + `lucide-react` icons. Hand-rolled components in `src/components/ui/` |
| DB | PostgreSQL 16 in Docker (already running, see `.env` → `DATABASE_URL`) + Prisma ORM |
| Auth | Email/password. `bcryptjs` hashes. JWT (`jose`) in an httpOnly, SameSite=Lax cookie. Next middleware gates routes by role |
| Validation | `zod` on every API input |
| Payments | `PaymentProvider` interface with two implementations: `StripeProvider` (Checkout Sessions + webhook + refunds API) and `MockProvider`. Selected by `PAYMENTS_PROVIDER` env (`stripe` / `mock` / `auto` = stripe if `STRIPE_SECRET_KEY` is set, else mock) |
| Real-time | Socket.IO. Rooms: `user:<id>`, `shop:<id>`, `order:<id>`, `admin`. The `io` instance lives on `globalThis` so route handlers can emit |
| Images | `StorageProvider` interface; `LocalStorageProvider` writes to `./uploads/` and serves via `/api/uploads/[...path]` |
| Client state | Cart in a small `zustand` store persisted to localStorage. Everything else is server data |
| Tests | Vitest (unit + API-level integration) and Playwright (E2E, chromium only) |

If the latest major version of a library has breaking changes that cost you more than a few minutes,
pin the previous major and log it in `docs/DECISIONS.md`.

## Conventions

- Money is always **integer paise** (`amountPaise`). Currency from `CURRENCY` env (default `inr`). Format only in UI.
- All order status changes go through `src/lib/order-state.ts` (`canTransition`, `transition`). No direct
  `prisma.order.update({ status })` anywhere else. Every status change: writes an `OrderEvent` row, creates
  `Notification`s, and emits Socket.IO events — all via `src/server/orders/changeStatus.ts`.
- Authorization lives in `src/server/auth/guards.ts` (`requireUser`, `requireRole`, `requireShopOwner(shopId)`,
  `requireOrderAccess(orderId)`). Every API route calls a guard. Suspended users are rejected everywhere.
- API routes: `src/app/api/**/route.ts`. Pages: `src/app/(customer)/…`, `src/app/(shop)/shop/…`, `src/app/(admin)/admin/…`,
  `src/app/(auth)/…`. Business logic in `src/server/**`, not in route files.
- No `any` unless unavoidable (comment why). No dead code, no TODO stubs for spec features.
- Mobile-first UI. Status badge colours are defined once in `src/components/ui/StatusBadge.tsx`.
- Never weaken, skip, or delete a test to make it pass. Fix the code.
- Never commit `.env` or `uploads/`. Never print secrets.

## Commands (create these in phase P01 and keep them working)

- `npm run dev` — custom server in dev mode on `PORT` (default 3000)
- `npm run build` / `npm start`
- `npm run verify` — **typecheck + lint + unit tests + `next build`**. Must pass at the end of every phase.
- `npm run e2e` — Playwright against a fresh `pec_market_e2e` database with `PAYMENTS_PROVIDER=mock`
- `npm run db:migrate` · `npm run db:seed` · `npm run db:reset`

The Postgres container is started by the human's `setup.sh`. If the DB is unreachable, try
`docker compose up -d db` once; if that is not possible, note it in PROGRESS.md and continue with work that does not need the DB.

## End-of-phase checklist (every session)

1. All acceptance criteria for the phase in `docs/PLAN.md` are met.
2. `npm run verify` passes (and `npm run e2e` if the phase says so).
3. Append a short entry to `docs/PROGRESS.md`: what was built, how it was verified, anything deferred.
4. Tick the phase's checkbox in `docs/PLAN.md` (`- [ ]` → `- [x]`).
5. `git add -A && git commit -m "P0X: <phase title>"`. Do not push.
