# PEC Market — hands-off build with Claude Code

This folder is a build kit. Claude Code builds the whole app by itself, one phase at a time, and commits after each one.

| File | Purpose |
|---|---|
| `docs/SPEC.md` | Your brief, rewritten as an exact spec with the gaps filled in (cart rules, refund rules, statuses…) |
| `docs/PLAN.md` | 13 phases in the brief's 4 Scrum sprints, each with acceptance tests |
| `CLAUDE.md` | Rules Claude Code reads every session: locked stack, conventions, "never ask, decide and log it" |
| `autorun.sh` | Starts a fresh Claude Code session per phase until every phase is ticked. Waits out usage limits and retries |
| `setup.sh` | One-time setup: checks tools, starts Postgres in Docker, writes `.env`, starts the git repo |

## What you do (about 10 minutes, then walk away)

1. **Install:** Node.js 20+, git, Docker Desktop (and start it), and Claude Code
   (`npm install -g @anthropic-ai/claude-code`, then run `claude` once to log in, and `claude update`).
   On Windows, do all of this inside WSL (Ubuntu).
2. **(Optional, 5 min) Skim `docs/SPEC.md`.** Anything marked **[filled gap]** is a choice I made for you. Change it now if you disagree.
   Editing it later means rework.
3. **Run setup:**
   ```bash
   cd pec-market
   chmod +x setup.sh autorun.sh
   ./setup.sh
   ```
4. **Start the build and leave it:**
   ```bash
   ./autorun.sh
   ```
   Keep the terminal open and the laptop plugged in. On a Mac the script keeps the machine awake itself.
   To check progress from another terminal: `tail -f logs/autorun.log` or `git log --oneline`.
5. **When it says "All phases complete":**
   - Read `docs/PROGRESS.md` → **"Blocked / needs human"** section.
   - `npm run dev` → open http://localhost:3000
   - Demo logins: `student1@pec.test` / `student123`, `shop1@pec.test` / `shop123`, `admin@pec.test` / `admin123`

If it stops early (laptop slept, limit window, you pressed Ctrl-C), just run `./autorun.sh` again. It continues from the first unticked phase.

## Real Stripe payments (do this after the build)

The app is built against a mock payment page so the build never waits on you. To switch to real Stripe **test mode**:

1. In the Stripe dashboard (test mode) → Developers → API keys, copy the keys into `.env` (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
2. Install the Stripe CLI and run `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`.
   Put the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.
3. Restart `npm run dev`. Pay with card `4242 4242 4242 4242`, any future expiry, any CVC.

Payments still confirm without step 2 (the success page checks with Stripe). Refund webhooks need step 2.

## Knobs

```bash
MODEL=opus ./autorun.sh                 # pick a model
MAX_ITERS=60 ./autorun.sh               # allow more sessions
STALL_WAIT=600 ./autorun.sh             # wait 10 min (not 20) after a usage-limit stall
```

`autorun.sh` uses Claude Code's **auto** permission mode, which is safe to run on your own laptop.
Risky commands are blocked and Claude keeps working. For zero blocks, run it inside a throwaway VM or dev container
with `MODE=bypassPermissions`. Never use that mode on your main machine.
