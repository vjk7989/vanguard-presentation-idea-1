# Test results

Verified on 2026-10-09 for the live-presence and role-workspace update.

| Check | Result |
|---|---|
| Strict TypeScript and ESLint | Pass — `pnpm typecheck`, `pnpm lint` |
| Financial, hash-link, formatting, and mock-fixture unit tests | Pass — 8 tests |
| PostgreSQL transactions | Pass — 7 integration tests on isolated local PostgreSQL 17; covers concurrent claims, retries, rollback, presence, self-switch, kick, mock queue, reset, replay, and stale-run rejection |
| Fixture Chrome browser flows | Pass — 14 Playwright tests, including QR auto-join, admin roster, kick/rejoin, role change, mock approval, and all three role workspaces |
| Responsive and accessibility checks | Pass — 1366px admin plus 360px/430px role screens, 200% text zoom, keyboard replay, reduced motion, and no serious or critical axe findings on tested views |
| Production compilation | Pass — `pnpm build` without database credentials |
| Graft drift | Pass — `pnpm exec graft build` then `pnpm graft:check` |
| Supabase migration | Pass — `003_demo_queue.sql` applied to the dedicated `reserve-operations-lab` project; current `DEMO01` run has nine items, six pending, and RLS enabled |
| Deployed multi-device run | Pending production smoke test after Git push and Vercel deployment |

Screenshots live in `docs/screenshots/`. The disposable PostgreSQL server was stopped after integration tests. Its ignored generated files remain under `.tmp/pg-integration-20261009` because the environment did not permit recursive removal; they are not committed.

Supabase security advisors report only the expected [RLS-enabled/no-policy informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for server-only tables. The performance advisor reports informational [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); no missing foreign-key-index issue was reported. Browser clients do not query these tables through Supabase's Data API.
