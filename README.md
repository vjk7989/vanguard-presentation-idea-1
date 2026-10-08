# Reserve Operations Lab

A fictional, interactive demonstration of issuer reserve operations. Everyone uses one public room, `DEMO01`. A presenter controls the shared view on a laptop, and three participants use phones as issuer treasury, fund operations, and bank operations. The six-step Friday redemption ends with $1.5bn in fund holdings, $50m bank cash, and $1.55bn obligations.

**Simulation disclaimer:** All participants, balances, wallet IDs, references, transactions, and ledger hashes are fictional. There is no real bank connection, blockchain node, private key, cryptocurrency wallet, settlement network, or money movement. This is not an official Vanguard product or endorsement. The demonstration makes no claim about settlement speed, cost savings, or blockchain performance.

## Local setup

Requirements: Node.js 22, pnpm 9, and a PostgreSQL database for live multi-device use. Supabase Postgres is supported.

1. Run `pnpm install` in this project. The project `.npmrc` keeps the pnpm store and npm cache here.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `SESSION_SECRET` (at least 32 characters), and `CRON_SECRET`. `APP_ORIGIN` is optional; same-origin browser requests work without it.
3. Set `DATABASE_URL` in your shell and run `pnpm migrate`. The ordered, idempotent migrations are in `db/`. On Supabase, use a dedicated project; the initial migration enables RLS on every app table, with no browser-facing policies. The app uses server-side Postgres connections and does not need a Supabase API key.
4. Run `pnpm dev`. Open `http://localhost:3000` from the presenter laptop. The first visitor initializes the shared room automatically.

For phones on a local network, use an HTTPS tunnel or host with a reachable origin. The QR code uses the browser's current origin. The secure session cookie is enabled automatically in production.

## Presenter flow

Choose **Open control room**. No presenter code is required; controls are public because this is a shared demo. Display the QR code or send `/join/DEMO01`. Participants claim one role each. The presenter can **Kick** a participant, invalidating that session and freeing its role. A kicked participant can press **Rejoin** or rescan the QR code and choose an available role. Start the scenario, then follow the current-step prompt. The presenter may act on behalf of any role. Switch comparison views at any time; the mode affects presentation only. After fund processing, the presenter may delay bank confirmation. After receipt, the presenter may repeat the bank notice. Restart creates a new run while retaining roles; prior runs remain available for replay. Participants may join even when a run is paused or ended, but transaction actions require an active run.

See [Presenter script](docs/presenter-script.md) and [Walkthroughs](docs/walkthroughs.md).

## Data and security

- PostgreSQL `BIGINT` stores all money in minor units. API JSON exposes monetary values as decimal strings.
- Each accepted workflow event receives an ordered index, previous hash, SHA-256 event hash, and state-after snapshot. These are simulated ledger references.
- Mutations lock the room row, validate session and run, update state, append an event, save an idempotent response, and increment the revision in one database transaction.
- Role claims have unique room/role and room/session constraints. Presenter controls and role actions are checked against the session on the server; anyone may obtain a presenter session from the public home page. Do not use this deployment for real data.
- Sessions use opaque HTTP-only cookie tokens. Only HMAC-SHA-256 token hashes are stored in the database. Mutations validate the `Origin` header against the request origin (and optional `APP_ORIGIN`).
- The shared `DEMO01` room persists; older legacy rooms expire after 24 hours. A Hobby-compatible daily Vercel Cron job deletes expired legacy rooms at its next run (scheduled for 02:00 UTC, with Hobby's within-the-hour timing).

## Tests

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `pnpm graft:check`. Playwright uses locally installed Chrome. If this project's dev server is already running, set `PLAYWRIGHT_BASE_URL` to its origin (for example, `http://127.0.0.1:3000`) before `pnpm test:e2e` so Playwright reuses it without starting a second server. Unit and fixture tests do not need a database. Set `TEST_DATABASE_URL` to a disposable PostgreSQL database and run `pnpm test:integration` to verify transactional concurrency and recovery. The older `NEON_TEST_DATABASE_URL` name is also accepted. Results from the latest implementation run are in [Test results](docs/test-results.md).

## Vercel handoff

Import this public repository into Vercel. Supply `DATABASE_URL`, `SESSION_SECRET`, and `CRON_SECRET` as environment variables. `APP_ORIGIN` is optional. For Supabase, copy the **Transaction pooler** URI from the project's Connect panel into Vercel's `DATABASE_URL`; replace its password placeholder with the private database password, percent-encoding special characters if necessary. The app's Postgres.js client already disables prepared statements as required by transaction pooling. Apply the ordered migrations before using the site. Keep the database URL server-only—never prefix it with `NEXT_PUBLIC_` or put it in Git. Redeploy after changing Vercel environment variables. Vercel reads `vercel.json` for the daily cleanup schedule. The production build does not connect to a database during compilation.

This repository does not provision a database or include production credentials. The participant QR entry point is `/join/DEMO01` on the deployed origin.

Use `https://vanguard-presentation-idea-1.vercel.app` as the stable production URL. The older `-ze6x.vercel.app` link redirects there, preserving room paths and query strings.
