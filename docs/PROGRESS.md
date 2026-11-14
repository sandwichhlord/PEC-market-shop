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
