# Decisions log

One line per decision made without asking: `P0X — decision — why`.

P01 — Pinned TypeScript ~6.0.3 (not 7.x) — typescript-eslint (used by eslint-config-next) only supports TS <6.1.
P01 — Pinned ESLint 9 (not 10) — eslint-plugin-react / import / jsx-a11y do not support ESLint 10 yet.
P01 — Pinned Prisma 7.10.1 — npm `latest` tag points at 8.0.0-rc; 7.10.1 is the newest stable. Uses Prisma 7 `prisma.config.ts`, `prisma-client` generator (output `src/generated/prisma`, gitignored) and `@prisma/adapter-pg`.
P01 — `db:reset` = `prisma migrate reset --force && prisma db seed` — Prisma 7 no longer runs the seed automatically on reset.
P01 — `npm run e2e` resets the e2e DB, runs `next build`, then Playwright starts `server.ts` in production mode on port 3100 — production mode avoids first-compile delays that make tests flaky.
P01 — `/api/health` has no auth guard — public liveness probe with no input and no user data.
P01 — npm 11 install-script gating: approved `prisma`, `@prisma/engines`, `esbuild` (recorded under `allowScripts` in package.json).
P01 — `.gitignore`: `uploads/` → `uploads/*` so the `!uploads/.gitkeep` exception actually applies.
P01 — E2E DB prep no longer uses `prisma migrate reset` — Playwright global setup (`e2e/global-setup.ts` → `e2e/support/e2e-db.ts`) creates the DB if missing, runs `prisma migrate deploy`, then `TRUNCATE … RESTART IDENTITY CASCADE` on every table except `_prisma_migrations`, then `prisma db seed`. Human-approved: wiping `pec_market_e2e` on every run is fine (disposable test DB).
P01 — Hard guard: E2E setup refuses to run unless the database name in `E2E_DATABASE_URL` ends in `_e2e` — checked in `scripts/e2e.ts` (before the build) and again in global setup (before any DB access); unit-tested in `tests/e2e-db-guard.test.ts`.
P01 — `npm run db:reset` stays `prisma migrate reset --force && prisma db seed`; the human runs it themselves in a terminal (Prisma blocks it when an AI agent runs it).
P01 — P02 acceptance reworded: `db:migrate` + idempotent `db:seed` + `npm run e2e` instead of `npm run db:reset` — agents cannot run `migrate reset` (Prisma blocks it; human-only per CLAUDE.md "Database safety").
P01 — Added `.gitattributes` (`*.sh text eol=lf`) — Windows autocrlf would otherwise give setup.sh/autorun.sh CRLF endings, which bash rejects.
P02 — Wrong-actor transitions throw `ForbiddenTransitionError` (HTTP 403); transitions not in the table throw `InvalidTransitionError` (HTTP 409). Both extend `OrderTransitionError` with `httpStatus`.
P02 — "REFUND_REQUESTED → previous status" is modelled as REFUND_REQUESTED → PLACED_PAID/PREPARING/READY_FOR_PICKUP (shop or admin) and requires `options.previousStatus` to equal the target; callers derive it from the `OrderEvent` that entered REFUND_REQUESTED (no extra Order column).
P02 — "PLACED_PAID … COMPLETED → COMPLAINT_FILED" = PLACED_PAID, PREPARING, READY_FOR_PICKUP, COMPLETED. No complaints from REFUND_REQUESTED/REFUNDED/RESOLVED.
P02 — Order creation is recorded as an `OrderEvent` with `fromStatus = null → PENDING_PAYMENT` (fromStatus is nullable for that reason).
P02 — Added to SPEC §9 models: `updatedAt` on User/Shop/MenuItem/Complaint/CustomerReport, `createdAt` on MenuItem, `NotificationType` enum (ORDER_STATUS, NEW_ORDER, DISPUTE, REPORT, ACCOUNT), unique `Order.stripeCheckoutSessionId`, query indexes.
P02 — FK deletes: orders/order items `Restrict` their customer, shop and menu item (history is never lost; dishes are soft-deleted); everything else cascades from its parent.
P02 — Seed is idempotent via fixed ids / unique keys with `upsert(update: {})`; seeded orders are skipped if their `orderNumber` exists and each order (items, events, notifications, review, complaint) is written in one transaction. Re-running never overwrites changes made in the app.
P02 — Seed images: `src/lib/placeholder-svg.ts` writes SVGs to `${UPLOAD_DIR}/seed/`; URLs are `/api/uploads/seed/<file>.svg` (route arrives in P03). Seed order numbers are `PEC1001`…`PEC1008`; the runtime format is decided in P06.
P02 — Seeded order histories are replayed through `transition()` at seed time (and in `tests/seed-data.test.ts`) so seed data can never be in an unreachable state.
