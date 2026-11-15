# PEC Market — Software Development Life Cycle

This document explains how PEC Market was built. It maps the course brief's four Scrum sprints to the build phases
and the commits in this repository, and summarises how the software was tested.

## 1. Process: Agile / Scrum

| Scrum element | How it was applied |
|---|---|
| **Product backlog** | `docs/SPEC.md`: the brief rewritten as testable requirements (roles, screens, order states, refund rules, data model, seed data). Gaps in the brief were filled and marked **[filled gap]** |
| **Sprint backlog** | `docs/PLAN.md`: 13 phases (P01–P13) grouped into 4 sprints. Each phase lists its scope and explicit **acceptance criteria** |
| **Definition of Done** | The end-of-phase checklist in `CLAUDE.md`: every acceptance criterion met; `npm run verify` (typecheck + lint + unit/integration tests + production build) passing (plus `npm run e2e` where the phase required it); progress logged; phase ticked; one commit per phase |
| **Increment** | Each phase commit is a working, building app. Later phases only add to it |
| **Sprint review** | `docs/PROGRESS.md`: one entry per phase saying what was built, how it was verified, and what was deferred, plus a "Blocked / needs human" list |
| **Decision log** | `docs/DECISIONS.md`: every interpretation of an ambiguous requirement, with its reason (like architecture decision records) |
| **Retrospective / adaptation** | Problems found during a sprint changed later work. Examples: the E2E database guard moved out of `prisma migrate reset` (P01 follow-up); the Vitest-on-Git-Bash workaround was documented; tests were made robust to host load (P06–P12); the spec audit (P13) found a gap that was then fixed |

Each phase ran as a time-boxed session: read the plan and progress → implement → verify against the acceptance
criteria → log → commit. Independent work (test writing, the security audit, the spec audit) was sometimes given
to parallel sub-agents, and the results were integrated and re-verified before committing.

## 2. Sprints → phases → commits

Commit hashes are from `git log --oneline`. P13 is the final commit of the history.

### Sprint 1 — Architecture & Auth (2026-11-14)

| Phase | Commit(s) | Delivered |
|---|---|---|
| P00 build kit | `70bf580` | Spec, plan, project rules, setup and automation scripts |
| P01 Scaffold & tooling | `89aaad0`, `5f02c5d` | Next.js + TypeScript strict, Tailwind, ESLint, Vitest, Playwright, Prisma, custom `server.ts` (Next + Socket.IO), `/api/health`; guarded disposable E2E database |
| (process) | `57ef2a3`, `99f2cd3` | Safer acceptance criteria and DB safety rule; Vitest/Git Bash workaround documented |
| P02 Data model, state machine, seed | `76c3336` | Full Prisma schema, order state machine with typed errors, idempotent seed with generated SVG images |
| P03 Auth, roles, guards, storage | `b59e235` | Signup/login for three portals, JWT cookie, role proxy, guards, suspended/warned handling, image storage, portal shells |

### Sprint 2 — Core Portals (2026-11-14)

| Phase | Commit | Delivered |
|---|---|---|
| P04 Customer browsing | `588a8c4` | Shops list with search and ratings, menu page, dish sheet, one-shop cart rules, status badges, skeleton/empty/error states |
| P05 Shop portal | `64ce573` | Menu CRUD with photos and soft delete, stock toggle, profile and open/closed, orders dashboard, kitchen status actions, `changeStatus()` |

### Sprint 3 — Order Flow & Payments (2026-11-14)

| Phase | Commit | Delivered |
|---|---|---|
| P06 Cart, checkout, payment providers | `a58f5e7` | Checkout re-validation, `PaymentProvider` with Stripe and Mock, signed webhook, idempotent `markOrderPaid`, failure/retry path |
| P07 Order lifecycle & history | `482cc5f` | Customer order page with progress tracker, ETA, timeline; Active/Past history |

### Sprint 4 — Real-time & Admin (2026-11-14 → 2026-11-15)

| Phase | Commit | Delivered |
|---|---|---|
| P08 Real-time sync & notifications | `90ee4c9` | Socket.IO auth and rooms, live pages, notification bell, toasts |
| P09 Refunds & complaints | `7992c70` | Refund requests (items or whole order), complaints, shop approve/reject/reply/resolve, partial refunds, `charge.refunded` sync |
| P10 Reviews | `ba1d7dd` | Star rating, comment and up to 3 photos on completed orders; shop averages |
| P11 Customer reports & admin portal | `f4ad658` | Shop reports customer; admin dashboard, disputes queue with force refund, reports queue, users and shops directories |

### Hardening & delivery (2026-11-15)

| Phase | Commit | Delivered |
|---|---|---|
| P12 End-to-end test suite & security pass | `10652d3` | Seven end-to-end user journeys (`e2e/journeys.spec.ts`); API route audit; login rate limiting; open-redirect, logout-CSRF, upload size and upload-role fixes |
| P13 Polish, docs, spec audit | final commit | Requirement-by-requirement `SPEC_AUDIT.md` (gap fixed: live shops list); focus-ring, reduced-motion and error/404 polish; README, ARCHITECTURE, this document |

## 3. Testing summary

Testing ran at three levels. Every phase had to pass `npm run verify` before its commit.

| Level | Tool | Scope | Size |
|---|---|---|---|
| Static | TypeScript strict, ESLint | Whole codebase | Run in every `verify` |
| Unit | Vitest | Pure logic: order state machine (every allowed transition and many disallowed ones, including wrong actor), money formatting, cart rules, order tracking/ETA, portal routing, safe redirects, rate limiter, storage sniffing, Stripe provider (SDK mocked), status badge colours vs SPEC | Part of 595 Vitest tests in 36 files |
| Integration (API) | Vitest + real PostgreSQL (`pec_market_test_e2e`, truncated each run) | Route handlers called directly: auth and every guard, checkout validation, payments and webhooks (real Stripe signatures), the full order lifecycle, refunds (full/partial/double/racing), complaints, reviews, reports, every admin action, uploads, notifications, Socket.IO delivery with real clients | 18 API test files + realtime/state tests |
| End-to-end | Playwright (chromium), production build, mock payments, freshly seeded `pec_market_e2e` | Real browser flows across several logged-in contexts: browsing at 375 px and 1280 px, cart and checkout, kitchen flow, live updates within 3–5 s, refunds and complaints, reviews, admin moderation, the seven P12 journeys, role-gating | 48 tests in 11 spec files |

**Traceability.** `docs/SPEC_AUDIT.md` maps each SPEC requirement to its implementing file and to the test that
covers it.

**Quality rules enforced throughout:**
- Tests are never weakened or skipped to make them pass.
- All order status changes go through one audited function.
- Every API route validates its input with zod and calls an authorisation guard.
- Money is stored as integer paise.
- The test databases are guarded so that only databases ending in `_e2e` can ever be truncated.

**Known environment issue.** On the development machine, other Docker workloads sometimes saturated the CPU. This
caused Postgres connection timeouts and some test runs failed for reasons unrelated to the code. These runs are
recorded in `docs/PROGRESS.md` under "Blocked / needs human", and the affected tests were re-run on a quieter host.
