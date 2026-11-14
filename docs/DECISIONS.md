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
