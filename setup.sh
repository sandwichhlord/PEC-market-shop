#!/usr/bin/env bash
# One-time setup for the PEC Market autonomous build. Run from the project folder: ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
need()  { command -v "$1" >/dev/null 2>&1 || { red "Missing: $1 — $2"; exit 1; }; }

need node   "install Node.js 20 or newer (https://nodejs.org)"
need git    "install git"
need docker "install Docker Desktop and start it"
need claude "install Claude Code: npm install -g @anthropic-ai/claude-code  (then run 'claude' once to log in)"

node_major=$(node -p 'process.versions.node.split(".")[0]')
if (( node_major < 20 )); then red "Node $node_major found; need 20+"; exit 1; fi
docker info >/dev/null 2>&1 || { red "Docker is installed but not running. Start Docker Desktop and re-run."; exit 1; }

echo "→ Starting Postgres (port 5433)…"
docker compose up -d db
for i in {1..30}; do
  if docker compose exec -T db pg_isready -U pec >/dev/null 2>&1; then break; fi
  sleep 1
  if (( i == 30 )); then red "Postgres did not become ready"; exit 1; fi
done
green "  Postgres is up."

if [[ ! -f .env ]]; then
  echo "→ Writing .env…"
  secret=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
  cat > .env <<EOF
DATABASE_URL="postgresql://pec:pec@localhost:5433/pec_market?schema=public"
E2E_DATABASE_URL="postgresql://pec:pec@localhost:5433/pec_market_e2e?schema=public"
JWT_SECRET="$secret"
APP_URL="http://localhost:3000"
PORT=3000
UPLOAD_DIR="./uploads"
CURRENCY="inr"

# auto = use Stripe if STRIPE_SECRET_KEY is set, otherwise the built-in mock payment page
PAYMENTS_PROVIDER="auto"
# Stripe TEST-mode keys (dashboard.stripe.com → Developers → API keys). Optional for the build.
STRIPE_SECRET_KEY=""
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
# From 'stripe listen --forward-to localhost:3000/api/payments/stripe/webhook'. Optional.
STRIPE_WEBHOOK_SECRET=""
EOF
  green "  .env created (Stripe keys left blank — the build uses mock payments until you add them)."
else
  echo "→ .env already exists, leaving it alone."
fi

mkdir -p uploads logs && touch uploads/.gitkeep
chmod +x autorun.sh

if [[ ! -d .git ]]; then
  git init -q
  # Make sure commits work even if git has no global identity configured.
  git config user.name  >/dev/null || git config user.name  "PEC Market Builder"
  git config user.email >/dev/null || git config user.email "builder@pec.local"
  git add -A
  git commit -qm "P00: build kit (spec, plan, rules)"
  green "  Git repo initialised."
fi

claude --version >/dev/null 2>&1 && green "  Claude Code: $(claude --version)"
green "Setup done. Start the build with:  ./autorun.sh"
