# Test results

This document records verified checks from the implementation run. Database-backed checks require a disposable Neon test URL and are marked pending until one is supplied. Fixture browser checks exercise the UI and do not claim live multi-device validation.

| Check | Result |
|---|---|
| TypeScript strict check | Pass — `pnpm typecheck` |
| ESLint | Pass — `pnpm lint` |
| Financial and ledger unit tests | Pass — 5 tests |
| Production build without database | Pass — `pnpm build`, all routes generated |
| Fixture Playwright desktop and phone views | Pass — 6 Chrome tests at 1366px, 360px, and 430px |
| Chrome accessibility scan | Pass — no serious or critical axe violations on tested presenter light/dark and participant views |
| Graft drift check | Pass — `pnpm exec graft build` then `pnpm exec graft check` |
| Concurrent role claims, idempotency, rollback, and cleanup | Pass — 4 integration tests on disposable local PostgreSQL 17; Supabase-hosted run pending connection credentials |
| Live four-device and QR scan | Pending live Vercel database connection |

Screenshots are saved in `docs/screenshots/` after the Playwright fixture suite runs.

## Supabase preparation (2026-10-09)

The initial migration was applied twice to a disposable local PostgreSQL 17 database without errors. The dedicated `reserve-operations-lab` Supabase project is now active; the initial and foreign-key-index migrations have both been applied there. All eight app tables have RLS enabled. The Supabase security advisor reports only the expected informational notice for tables with RLS and no browser-facing policies; the performance advisor reports no missing foreign-key indexes. The four local transaction integration tests passed, including retry response shape and replay snapshots. A fresh strict type check, ESLint run, five unit tests, six Chrome fixture tests, production build, and Graft drift check passed. Live Vercel room creation and hosted multi-device checks remain pending until its server environment is connected to Supabase.
