# Progress log

Append one entry per phase (newest at the bottom).

## Blocked / needs human
- **Prisma blocks `migrate reset` when run by an AI agent** (found in P01). `prisma migrate reset` (used by
  `npm run db:reset` and `npm run e2e`) aborts unless the env var `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`
  holds the user's explicit consent text. In unattended `autorun.sh` sessions nobody can give consent, so P02's
  `db:reset` check and every `npm run e2e` will be blocked. A human needs to decide how to handle this (e.g. run
  those commands themselves, or give consent in an attended session).

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

**Deferred:** `npm run e2e` was not re-run after a small change to how `scripts/e2e.ts` spawns commands (one
command string instead of cmd + args, to silence Node's DEP0190 warning); re-running needs another consented reset.
