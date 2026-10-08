# Test results

Verified on 2026-10-09 for the three-view role workspaces and cross-profile joining update.

| Check | Result |
|---|---|
| Strict TypeScript and ESLint | Pass — `pnpm typecheck`, `pnpm lint` |
| Financial, hash-link, formatting, mock-fixture, and canonical invite unit tests | Pass — 9 tests |
| PostgreSQL transactions | Pass — 9 integration tests on isolated local PostgreSQL 17; covers concurrent claims, retries, rollback, presence, self-switch, kick, mock queue, reset, replay, stale-run rejection, and snapshots continuing while a room mutation holds its lock |
| Fixture Chrome browser flows | Pass — 34 Playwright tests covering nine distinct role/view combinations, QR joining, same-profile tabs, separate browser contexts, roster, kick/rejoin, role change, mock approvals, and replay; three representative flows rerun after the polling optimization |
| Responsive and accessibility checks | Pass — 320–430px phones, 768px tablet, 1366px desktop, 200% text zoom, keyboard and reduced-motion flows, and no serious or critical axe findings on tested views |
| Production compilation | Pass — `pnpm build` without database credentials |
| Graft drift | Pass — `pnpm exec graft build` then `pnpm graft:check` |
| Supabase migration | Pass — `003_demo_queue.sql` applied to the dedicated `reserve-operations-lab` project; current `DEMO01` run has nine items, six pending, and RLS enabled |
| Canonical Vercel smoke test | Pass — commit `385298c` deployed successfully; homepage, new Work route, and room preview returned 200; a live Chrome admin profile showed the canonical QR, a separate Chrome context joined, and its second tab reused the session. The test participant was kicked afterward. |
| Full deployed four-device run | Pending — not exercised on the shared public room, to avoid changing its financial run during verification |
| Physical Chrome device | Unverified — no phone or external Chrome device was connected to this workspace |

Screenshots for all nine role/view combinations at 360px and 1366px, plus the admin QR and legacy surfaces, live in `docs/screenshots/`. Browser tests used the installed Chrome channel against a local production server. The full run used `PLAYWRIGHT_TRACE=off` because Chrome trace archiving exhausted the remaining project disk; default test runs still retain failure traces. The disposable PostgreSQL server was stopped after integration tests. Its ignored generated files remain under `.tmp/pg-integration-20261009` because the environment did not permit recursive removal; they are not committed.

## Performance check

Before the polling change, six authenticated requests to the canonical Vercel `/api/rooms/DEMO01/state` endpoint each took 3.21–3.24 seconds. After consolidating the read into one SQL statement and removing the room lock, six requests took 0.54–0.92 seconds. After the join-path follow-up, four more state requests took 0.60–0.94 seconds. These are end-to-end samples from this workspace, not a latency guarantee. The response still contained the same nine mock work items. A live participant joined, appeared in the waiting count, and was kicked afterward. No schema or financial transition changed.

Supabase security advisors report only the expected [RLS-enabled/no-policy informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for server-only tables. The performance advisor reports informational [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index); no missing foreign-key-index issue was reported. Browser clients do not query these tables through Supabase's Data API.
