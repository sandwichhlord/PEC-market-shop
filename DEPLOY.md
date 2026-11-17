# Deploying PEC Market (Railway)

This branch (`deploy`) holds everything deployment-specific. `master` stays the plain app.

Live URL: https://web-production-6ff6c49f.up.railway.app

## What runs where

| Railway service | What it is | Notes |
|---|---|---|
| `web` | This repo, built from `Dockerfile` | Volume `web-volume` mounted at `/data` (uploaded images in `/data/uploads`) |
| `Postgres` | Railway's managed PostgreSQL | Reached over the private network (`postgres.railway.internal`) |

Both services have **Serverless** (sleep) on: a service sleeps after ~5–10 minutes with no outbound traffic and wakes on
the next request. The first request after a sleep takes a few seconds and may return one 502; refresh and it loads.

## Service settings (set in the dashboard/API, not in a file)

Railway's `railway.json` stops being read on 2026-12-01, so these are stored as service settings:

| Setting | Value |
|---|---|
| Builder | Dockerfile (auto-detected at the repo root) |
| Pre-deploy command | `node_modules/.bin/prisma migrate deploy` |
| Healthcheck | `/api/health`, 120 s timeout |
| Restart policy | On failure, 5 retries |
| Serverless | On (`web` and `Postgres`) |

## Environment variables (`web`)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` (https also turns on secure cookies) |
| `JWT_SECRET` | random 32 bytes (set in Railway, never committed) |
| `PORT` | `3000` |
| `UPLOAD_DIR` | `/data/uploads` |
| `PAYMENTS_PROVIDER` | `mock` (switch to Stripe by adding the `STRIPE_*` keys and setting this to `stripe`) |
| `TRUST_PROXY` | `true` (Railway's proxy sets `X-Forwarded-For`) |
| `SEED_ADMIN_PASSWORD`, `SEED_SHOP_PASSWORD`, `SEED_CUSTOMER_PASSWORD` | Demo account passwords used by the seed (replace the public README ones) |

## Redeploying

From a checkout of this branch, with the Railway CLI logged in and linked (`railway link`):

```bash
railway up --service web --ci
```

Migrations run automatically before each deploy. The seed is run once, inside the container (it writes placeholder
images to the volume):

```bash
railway ssh --service web -- node_modules/.bin/prisma db seed
```

The seed only sets a password when it first creates a user, so changing `SEED_*_PASSWORD` later doesn't change existing
accounts.

## Cost

Railway's free plan gives $1 of usage credit per month (after a $5, 30-day trial). Sleep keeps usage low; if the credit
runs out Railway pauses the services rather than charging. Check usage with `railway usage`.
