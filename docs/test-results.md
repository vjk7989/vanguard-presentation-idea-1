# Test results

This document records verified checks from the shared-room change. Fixture browser checks exercise the UI; the live API smoke test uses the dedicated Supabase demo database, but does not claim a four-device or deployed Vercel run.

| Check | Result |
|---|---|
| TypeScript strict check | Pass — `pnpm typecheck` |
| ESLint | Pass — `pnpm lint` |
| Financial, ledger, and origin unit tests | Pass — 7 tests |
| Production build without database | Pass — `pnpm build`, all routes generated |
| Fixture Playwright desktop and phone views | Pass — 7 Chrome tests at 1366px, 360px, and 430px; includes Kick/Rejoin |
| Chrome accessibility scan | Pass — no serious or critical axe violations on tested presenter light/dark and participant views |
| Graft drift check | Pass — `pnpm exec graft build` then `pnpm exec graft check` |
| Concurrent claims, singleton room, Kick/Rejoin, idempotency, rollback, and cleanup | Pass — 5 integration tests on a new disposable local PostgreSQL 17 database, removed after testing |
| Live Supabase API smoke test | Pass — same `DEMO01` run, presenter open, participant join/claim, kick invalidates old session (HTTP 401), rejoin succeeds; test role freed afterward |
| Canonical Vercel production API smoke test | Pass — public room open, join/claim, Kick returns HTTP 401 to old session, rejoin/claim, and test role cleanup |
| Legacy `-ze6x` link | Pass — HTTP 307 to the canonical production URL at `/` and `/join/DEMO01?from=qr`, preserving the path and query |
| Four-device browser test | Pending |

Screenshots are saved in `docs/screenshots/` after the Playwright fixture suite runs.

## Supabase preparation (2026-10-09)

The initial and foreign-key-index migrations are applied to the dedicated `reserve-operations-lab` Supabase project. All eight app tables have RLS enabled. The Supabase security advisor reports only the expected informational notice for tables with RLS and no browser-facing policies; the performance advisor reports no missing foreign-key indexes. The public `DEMO01` room is initialized there. The canonical Vercel production URL also passed a live API smoke test: a kicked session receives HTTP 401, a new session can claim the freed role, and no participant role remains claimed after cleanup. The original four integration tests and the new shared-room test passed on disposable local PostgreSQL. Four simultaneous browser contexts are not yet verified against production.
