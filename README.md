# PEC Market

A food-ordering web app for the market inside Punjab Engineering College. Students order and pay online, shops get
paid orders live and run them through the kitchen, and a market admin settles disputes and moderates accounts.

- **Customers:** browse shops and menus, keep a one-shop cart, pay (Stripe or a built-in mock), track orders live,
  request refunds, file complaints, and review completed orders.
- **Shop owners:** manage the menu (with photos and stock toggles) and the shop profile (open or closed), work orders
  live (preparing → ready → completed), approve or reject refunds, reply to complaints, and report customers.
- **Admin:** dashboard counts, a disputes queue (force refund, resolve with a note), a reports queue (warn, suspend,
  reinstate, dismiss), and user and shop directories.

Stack: Next.js (App Router, TypeScript) on a custom `server.ts` that also hosts Socket.IO, PostgreSQL 16 with Prisma,
Tailwind CSS, zod, JWT cookies (`jose`), Stripe, Vitest and Playwright. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Requirements

- Node.js 20 or newer (developed on Node 26)
- Docker (for PostgreSQL), or your own PostgreSQL 16
- Optional: a Stripe account in test mode, and the [Stripe CLI](https://docs.stripe.com/stripe-cli)

## Setup

```bash
git clone <this repo> pec-market && cd pec-market
cp .env.example .env             # then set JWT_SECRET (see below)
npm install                      # also runs `prisma generate`
docker compose up -d db          # PostgreSQL on localhost:5433 (user/password: pec/pec)
npm run db:migrate               # create the tables in pec_market
npm run db:seed                  # demo shops, dishes, accounts and orders (safe to run twice)
npm run dev                      # http://localhost:3000
```

Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

On macOS or Linux, `./setup.sh` does the Docker and `.env` steps for you.

Without Stripe keys the app uses the **mock payment page**. Checkout opens `/pay/mock/<orderId>`, which has
**Pay** and **Fail payment** buttons.

## Demo accounts (from the seed)

| Role | Email | Password |
|---|---|---|
| Customer | `student1@pec.test` | `student123` |
| Customer | `student2@pec.test` | `student123` |
| Shop owner, Forks n Knives Cafe | `shop1@pec.test` | `shop123` |
| Shop owner, Paratha Cafe | `shop2@pec.test` | `shop123` |
| Shop owner, Combo Juice Bar | `shop3@pec.test` | `shop123` |
| Shop owner, Gyoza Cafe | `shop4@pec.test` | `shop123` |
| Admin | `admin@pec.test` | `admin123` |

Login pages: customers at `/login`, shops at `/shop/login`, admin at `/admin/login`. New customers sign up at
`/signup` and new shops at `/shop/signup`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | – | PostgreSQL connection for the app (`…/pec_market`) |
| `E2E_DATABASE_URL` | for tests | – | Disposable database for Playwright. **Its name must end in `_e2e`**, because it is truncated on every run |
| `TEST_DATABASE_URL` | no | `pec_market_test_e2e` on the E2E server | Disposable database for the Vitest integration tests (must end in `_e2e`) |
| `JWT_SECRET` | yes | – | Signs session cookies (32+ random bytes) |
| `APP_URL` | yes | `http://localhost:3000` | Public base URL, used for Stripe success and cancel URLs |
| `PORT` | no | `3000` | HTTP port for Next and Socket.IO |
| `UPLOAD_DIR` | no | `./uploads` | Where uploaded images are stored |
| `CURRENCY` | no | `inr` | Currency code sent to Stripe (amounts are stored in paise) |
| `PAYMENTS_PROVIDER` | no | `auto` | `stripe`, `mock`, or `auto` (Stripe if `STRIPE_SECRET_KEY` is set, otherwise mock) |
| `STRIPE_SECRET_KEY` | for Stripe | – | Stripe **test** secret key (`sk_test_…`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | for Stripe | – | Stripe test publishable key (`pk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | for Stripe webhooks | – | `whsec_…` printed by `stripe listen` |
| `TRUST_PROXY` | no | `false` | Set to `true` only behind a reverse proxy that sets `X-Forwarded-For` (used by the login rate limit) |

## Real Stripe payments (test mode)

1. In the Stripe Dashboard (test mode), go to **Developers → API keys** and copy the keys into `.env`:
   `STRIPE_SECRET_KEY=sk_test_…` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`. Keep `PAYMENTS_PROVIDER=auto`
   (or set it to `stripe`).
2. Forward webhooks to your local server:
   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/payments/stripe/webhook
   ```
   Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.
3. Restart `npm run dev`. The startup log shows `> Payments: stripe`. Pay with card `4242 4242 4242 4242`, any
   future expiry date, and any CVC. Card `4000 0000 0000 0002` is declined.

The success page confirms payment with Stripe even without step 2. You do need the webhook for asynchronous payment
results and for refunds made in the Stripe Dashboard (`charge.refunded`). Refunds approved in the app call Stripe's
Refunds API directly.

> Seeded "paid" orders were never charged, so refunding them under the real Stripe provider fails with a clear error.
> Place a new test-mode order to try refunds against Stripe.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Custom server (Next + Socket.IO) in dev mode on `PORT` |
| `npm run build` / `npm start` | Production build, and the production server |
| `npm run verify` | Typecheck, lint, Vitest (unit + API integration), then `next build` |
| `npm run e2e` | Production build, then Playwright (chromium) against a freshly migrated, truncated and seeded `E2E_DATABASE_URL` with mock payments |
| `npm test` | Vitest only (the integration tests need the `_e2e` test database to be reachable) |
| `npm run db:migrate` | `prisma migrate dev` on `DATABASE_URL` |
| `npm run db:seed` | Seed demo data (idempotent) |
| `npm run db:reset` | **Destructive:** drops and recreates the dev database, then seeds |

On Windows, run Vitest and `npm run verify` from PowerShell or cmd, not Git Bash. Under Git Bash, a drive-letter
casing mismatch loads two copies of Vitest.

## Tests

- **Unit and API integration (Vitest):** `src/**/*.test.ts`, `tests/**/*.test.ts`. Route handlers are called
  directly against a real PostgreSQL test database. This covers the state machine, every guard, checkout, payments
  (with the Stripe SDK mocked and real webhook signatures), refunds, reviews, admin actions, real-time delivery and
  the login rate limit.
- **End-to-end (Playwright):** `e2e/*.spec.ts`. The headline journeys are in `e2e/journeys.spec.ts`:
  1. golden path: signup → order → pay → live status → complete → review;
  2. a failed payment, then a retry;
  3. refund approved → the customer sees REFUNDED live;
  4. the shop rejects a refund → the admin forces it;
  5. a report → suspension → the customer is blocked;
  6. role-gating;
  7. the mobile golden path.

## Project layout

```
server.ts                  custom HTTP server: Next + Socket.IO
prisma/                    schema, migrations, seed (+ generated SVG placeholders)
src/app/(customer|shop|admin|auth)/  pages per portal
src/app/api/**/route.ts    JSON API (thin: zod → guard → service)
src/server/**              business logic: auth, orders, payments, disputes, reviews, reports, admin, realtime, storage
src/lib/**                 shared pure logic: order state machine, money, validation schemas, cart
src/components/**          UI (hand-rolled components in components/ui)
tests/, e2e/               Vitest and Playwright suites
docs/                      SPEC, PLAN, PROGRESS, DECISIONS, ARCHITECTURE, SDLC, SPEC_AUDIT
```
