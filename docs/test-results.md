# Test results

Verified on 2026-10-09 for the three-view role workspaces and cross-profile joining update.

| Check | Result |
|---|---|
| Strict TypeScript and ESLint | Pass — `pnpm typecheck`, `pnpm lint` |
| Financial, hash-link, formatting, and mock-fixture unit tests | Pass — 8 tests |
| PostgreSQL transactions | Pass — 8 integration tests on isolated local PostgreSQL 17; covers concurrent claims, retries, rollback, presence, self-switch, kick, mock queue, reset, replay, and stale-run rejection |
| Fixture Chrome browser flows | Pass — 34 Playwright tests covering nine distinct role/view combinations, QR joining, same-profile tabs, separate browser contexts, roster, kick/rejoin, role change, mock approvals, and replay |
| Responsive and accessibility checks | Pass — 320–430px phones, 768px tablet, 1366px desktop, 200% text zoom, keyboard and reduced-motion flows, and no serious or critical axe findings on tested views |
| Production compilation | Pass — `pnpm build` without database credentials |
| Graft drift | Pass — `pnpm exec graft build` then `pnpm graft:check` |
| Supabase migration | Pass — `003_demo_queue.sql` applied to the dedicated `reserve-operations-lab` project; current `DEMO01` run has nine items, six pending, and RLS enabled |
| Canonical Vercel smoke test | Pending for this release until GitHub-triggered deployment finishes |
| Full deployed four-device run | Pending — not exercised on the shared public room, to avoid changing its financial run during verification |

Screenshots for all nine role/view combinations at 360px and 1366px, plus the admin QR and legacy surfaces, live in `docs/screenshots/`. Browser tests used the installed Chrome channel against a local production server. The full run used `PLAYWRIGHT_TRACE=off` because Chrome trace archiving exhausted the remaining project disk; default test runs still retain failure traces. The disposable PostgreSQL server was stopped after integration tests. Its ignored generated files remain under `.tmp/pg-integration-20261009` because the environment did not permit recursive removal; they are not committed.

Supabase security advisors report only the expected [RLS-enabled/no-policy informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for server-only tables. The performance advisor reports informational [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); no missing foreign-key-index issue was reported. Browser clients do not query these tables through Supabase's Data API.
