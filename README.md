# Reserve Operations Lab

A fictional, interactive demonstration of issuer reserve operations. Everyone uses one public room, `DEMO01`. A presenter controls the live workflow view on a laptop, and three participants use phones as issuer treasury, fund operations, and bank operations. New six-step Friday runs redeem $150m and end with $1.55bn in fund holdings, $0 bank cash, and $1.55bn obligations. Earlier $200m/$50m-buffer runs remain replayable.

**Simulation disclaimer:** All participants, balances, wallet IDs, references, transactions, and ledger hashes are fictional. There is no real bank connection, blockchain node, private key, cryptocurrency wallet, settlement network, or money movement. This is not an official Vanguard product or endorsement. The demonstration makes no claim about settlement speed, cost savings, or blockchain performance.

## Local setup

Requirements: Node.js 22, pnpm 9, and a PostgreSQL database for live multi-device use. Supabase Postgres is supported.

1. Run `pnpm install` in this project. The project `.npmrc` keeps the pnpm store and npm cache here.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `SESSION_SECRET` (at least 32 characters), and `CRON_SECRET`. Set `APP_ORIGIN` to the public URL participants will open for mutation-origin validation. The shared `DEMO01` QR is pinned to the canonical deployed site.
3. Set `DATABASE_URL` in your shell and run `pnpm migrate`. The ordered, idempotent migrations are in `db/`. On Supabase, use a dedicated project; the initial migration enables RLS on every app table, with no browser-facing policies. The app uses server-side Postgres connections and does not need a Supabase API key.
4. Run `pnpm dev`. Open `http://localhost:3000` from the admin laptop. Entering the admin dashboard initializes the shared room automatically.

For phones, scan the QR to use the canonical deployment. To run an entirely local multi-device copy instead, use an HTTPS tunnel or reachable host and change `DEMO_PUBLIC_ORIGIN` in `src/lib/demo.ts` for that build; a `localhost` QR code cannot be opened from a different device. The secure session cookie is enabled automatically in production.

## Live demo flow

Choose **Enter admin dashboard** on the public homepage, then **Show QR**. Revealing the QR does not create a room or reset the run; it always points to `/join/DEMO01`. A new profile scanning the QR connects automatically; if exactly one role is available, the server claims it before navigation. An existing profile sees its current role and a dashboard link instead of a phantom new assignment. The admin sees separate claimed-role, online-participant, and role-choosing counts plus a device roster. A claimed but inactive role remains claimed and reads **Device offline**. The admin can **Kick** any participant device, invalidating its session; that person can press **Rejoin** or rescan. Participants can use **Change role** to release their position and choose another available role.

Each participant gets a distinct treasury, fund, or bank workspace with Overview (`/room/DEMO01`), Work (`/room/DEMO01/work`), and Activity (`/room/DEMO01/activity`) views. Desktop uses a navigation rail; phones use bottom navigation and touch-friendly record details. Every role has eight searchable fictional reference records and two job-specific **Start practice task** controls. New tasks reach a counterpart's shared inbox and are replayable, with a limit of 20 newly opened tasks per run. New runs seed four supporting practice items per role; existing runs are not backfilled. The Issuer also can open 20 repeatable three-party practice coordination cases. Accepted practice actions and background queue approvals do **not** change the guided scenario's balances, shares, margin, or tax outcome. Only the highlighted scenario action advances that outcome. On the projector, **Without blockchain** and **With blockchain** stay side by side, using the same accepted event; the switch spotlights one panel without changing balances or timing. Delay and duplicate-bank exceptions remain available. Restart starts fresh per-run work while retaining roles; earlier runs remain replayable.

Chrome tabs in one profile share a session and role and count as one device. A separate Chrome profile or device gets its own session and can claim another available role. Opening the QR link in the admin's own Chrome profile keeps that profile as admin; use a separate profile or Incognito window to join as a participant.

See [Presenter script](docs/presenter-script.md) and [Walkthroughs](docs/walkthroughs.md).

## Data and security

- PostgreSQL `BIGINT` stores all money in minor units. API JSON exposes monetary values as decimal strings.
- Each accepted workflow event receives an ordered index, previous hash, SHA-256 event hash, and state-after snapshot. These are simulated ledger references.
- Practice cases and background queue approvals are per-run database records. Their event snapshots include status for deterministic replay, while the financial state remains unchanged.
- Mutations lock the room row, validate session and run, update state, append an event, save an idempotent response, and increment the revision in one database transaction.
- Role claims have unique room/role and room/session constraints. Presenter controls and role actions are checked against the session on the server; anyone may obtain a presenter session from the public home page. Do not use this deployment for real data.
- Sessions use opaque HTTP-only cookie tokens. Only HMAC-SHA-256 token hashes are stored in the database. Mutations validate the `Origin` header against the request origin (and optional `APP_ORIGIN`).
- The shared `DEMO01` room persists; older legacy rooms expire after 24 hours. A Hobby-compatible daily Vercel Cron job deletes expired legacy rooms at its next run (scheduled for 02:00 UTC, with Hobby's within-the-hour timing).
- Presence counts sessions seen within 15 seconds and refreshes visible screens every two seconds. Unchanged polls return only compact presence data; changed polls return new events after the client's event cursor. The daily cleanup also removes inactive demo sessions older than 24 hours.

## Tests

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `pnpm graft:check`. Playwright uses locally installed Chrome. If this project's dev server is already running, set `PLAYWRIGHT_BASE_URL` to its origin (for example, `http://127.0.0.1:3000`) before `pnpm test:e2e` so Playwright reuses it without starting a second server. Unit and fixture tests do not need a database. Set `TEST_DATABASE_URL` to a disposable PostgreSQL database and run `pnpm test:integration` to verify transactional concurrency and recovery. The older `NEON_TEST_DATABASE_URL` name is also accepted. Results from the latest implementation run are in [Test results](docs/test-results.md).

## Vercel handoff

Import this public repository into Vercel. Supply `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, and `APP_ORIGIN=https://vanguard-presentation-idea-1.vercel.app` as environment variables. `DEMO01` uses the canonical URL for its cross-device QR even if an older deployment has a stale `APP_ORIGIN`; update the environment value too, for clarity. For Supabase, copy the **Transaction pooler** URI from the project's Connect panel into Vercel's `DATABASE_URL`; replace its password placeholder with the private database password, percent-encoding special characters if necessary. The app's Postgres.js client already disables prepared statements as required by transaction pooling. Apply the ordered migrations before using the site. Keep the database URL server-only—never prefix it with `NEXT_PUBLIC_` or put it in Git. Redeploy after changing Vercel environment variables. Vercel reads `vercel.json` for the daily cleanup schedule. The production build does not connect to a database during compilation.

This repository does not provision a database or include production credentials. The participant QR entry point is `/join/DEMO01` on the deployed origin.

Use `https://vanguard-presentation-idea-1.vercel.app` as the stable production URL. The older `-ze6x.vercel.app` link redirects there, preserving room paths and query strings.
