# Reserve Operations Lab

A fictional, interactive demonstration of issuer reserve operations. A presenter controls a shared room on a laptop. Three participants use phones as issuer treasury, fund operations, and bank operations. The six-step Friday redemption ends with $1.5bn in fund holdings, $50m bank cash, and $1.55bn obligations.

**Simulation disclaimer:** All participants, balances, wallet IDs, references, transactions, and ledger hashes are fictional. There is no real bank connection, blockchain node, private key, cryptocurrency wallet, settlement network, or money movement. This is not an official Vanguard product or endorsement. The demonstration makes no claim about settlement speed, cost savings, or blockchain performance.

## Local setup

Requirements: Node.js 22, pnpm 9, and a Neon PostgreSQL database for live multi-device use.

1. Run `pnpm install` in this project. The project `.npmrc` keeps the pnpm store and npm cache here.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `PRESENTER_ACCESS_CODE`, `SESSION_SECRET` (at least 32 characters), `APP_ORIGIN`, and `CRON_SECRET`.
3. Set `DATABASE_URL` in your shell and run `pnpm migrate`. The idempotent migration is in `db/001_initial.sql`.
4. Run `pnpm dev`. Open `http://localhost:3000` from the presenter laptop.

For phones on a local network, use an HTTPS tunnel or host with a reachable origin. Set `APP_ORIGIN` to that exact origin. The secure session cookie is enabled automatically in production.

## Presenter flow

Enter the private presenter access code and create a room. Display the QR code or six-character room code. Participants claim one role each. Start the scenario, then follow the current-step prompt. The presenter may act on behalf of any role. Switch comparison views at any time; the mode affects presentation only. After fund processing, the presenter may delay bank confirmation. After receipt, the presenter may repeat the bank notice. Restart creates a new run while retaining roles; prior runs remain available for replay.

See [Presenter script](docs/presenter-script.md) and [Walkthroughs](docs/walkthroughs.md).

## Data and security

- PostgreSQL `BIGINT` stores all money in minor units. API JSON exposes monetary values as decimal strings.
- Each accepted workflow event receives an ordered index, previous hash, SHA-256 event hash, and state-after snapshot. These are simulated ledger references.
- Mutations lock the room row, validate session and run, update state, append an event, save an idempotent response, and increment the revision in one database transaction.
- Role claims have unique room/role and room/session constraints. Presenter-only controls and role actions are checked on the server.
- Sessions use random HTTP-only cookie tokens. Only HMAC-SHA-256 token hashes are stored in the database. Mutations validate the `Origin` header against `APP_ORIGIN`.
- Rooms become inaccessible after 24 hours. A Hobby-compatible daily Vercel Cron job physically deletes expired rooms at its next run (scheduled for 02:00 UTC, with Hobby's within-the-hour timing).

## Tests

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `pnpm graft:check`. Playwright uses locally installed Chrome. Unit and fixture tests do not need a database. Set `NEON_TEST_DATABASE_URL` to a disposable Neon database and run `pnpm test:integration` to verify transactional concurrency and recovery. Results from the latest implementation run are in [Test results](docs/test-results.md).

## Vercel handoff

Import this public repository into Vercel. Supply `DATABASE_URL`, `PRESENTER_ACCESS_CODE`, `SESSION_SECRET`, `APP_ORIGIN` (the production origin), and `CRON_SECRET` as environment variables. Run `pnpm migrate` against the chosen Neon database before using the site. Vercel reads `vercel.json` for the daily cleanup schedule. The production build does not connect to Neon during compilation.

This repository does not provision Neon or include production credentials. The participant QR entry point is `/join/[code]` on the deployed origin.
