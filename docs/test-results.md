# Test results — four-idea release

Verified on 2026-10-09 against a local production server and intercepted API fixtures. The prior results below remain as historical release notes.

| Check | Result |
|---|---|
| Strict TypeScript and ESLint | Pass — `pnpm typecheck`, `pnpm lint` |
| Scenario and existing unit tests | Pass — 29 tests across 6 files; includes Ideas 2–4 transitions and practice/financial isolation |
| Fixture Chrome browser flows | Pass — 54 Playwright tests, including all 12 new desks across Overview, Work, and Activity, role selection, QR, cross-profile sessions, same-profile tabs, kick/rejoin, accepted-event diagram updates, keyboard and axe checks |
| Responsive and motion | Pass — tested 360px phones and 1366px desktop for every new desk; existing suite covers 320–430px, 200% text, and reduced motion |
| Production compilation | Pass — `pnpm build` without local database credentials |
| Graft drift | Pass after rebuilding the ignored local wiring graph |
| Supabase migration | Pass — `005_multi_idea.sql` applied to the dedicated `reserve-operations-lab` project; old 17 events remained untouched, and the live room stayed on Idea 1 |
| Database-backed integration | Pass — 11 tests on the isolated local PostgreSQL 17 cluster, including concurrent Idea 2 role claims, idea switching and restoration, retry-safe practice actions, financial isolation, stale-run rejection, prior-run replay, and existing transaction checks. The cluster was stopped after verification. |
| Canonical Vercel smoke | Pass — commit `dd749bf` served the new `ideaKey` preview and routes. Independent admin and participant HTTP sessions worked; the admin switched to Idea 2 (five roles, ten practice records) and back to the same Idea 1 run. A participant joined, appeared as waiting, was kicked, then received 401. |
| Physical Chrome device / latency p95 | Unverified — no external phone was connected, and a statistically meaningful warm action-to-projector p95 was not measured on the live deployment. |

Representative new phone and desktop captures are `docs/screenshots/idea-{2,3,4}-role-{360,1366}.png`. Browser tests used the installed Chrome channel and an intercepted API fixture; they do not establish live database performance or the two-second p95 target.

## Previous Friday release

Verified on 2026-10-09 for the deck-aligned Friday run and repeatable practice coordination.

| Check | Result |
|---|---|
| Strict TypeScript and ESLint | Pass — `pnpm typecheck`, `pnpm lint` |
| Financial, case-ordering, hash-link and formatting unit tests | Pass — 11 tests. Version two closes with $0 cash/$1.55bn fund; version one retains its $50m buffer. |
| PostgreSQL transaction integration | Pass — 10 tests on the existing isolated local PostgreSQL 17 cluster, including ten cases, concurrent retries, ordering, pause, reset and unchanged balances. The test cluster was stopped afterward. |
| Fixture Chrome browser flows | Pass — 36 Playwright tests covering all nine role/view combinations, ten practice requests, Fund/Bank case actions, QR joining, cross-profile contexts, same-profile tabs, kick/rejoin, comparison and replay. |
| Responsive and accessibility | Pass — 320–430px phones, 768px tablet, 1366px desktop, 200% text, keyboard, reduced motion, and no serious/critical axe findings on tested screens. |
| Production compilation | Pass — `pnpm build`, including page generation with two workers. |
| Graft drift | Pass — `pnpm exec graft build` and `pnpm graft:check`. |
| Supabase migration | Pass — `004_pitch_cases.sql` applied to the dedicated `reserve-operations-lab` project. Existing run remains version one; new runs select version two. |
| Canonical Vercel smoke test | Pass — `f12de71` deployed. The new case route is present; a separate HTTP session joined, appeared as waiting, received a compact unchanged poll with no event history, was kicked, and then received 401. Real Chrome in two separate profiles opened the admin dashboard/QR and joined the role picker. A clean version-two `DEMO01` run was started (run 3, step 0, no cases/events). Run 1 remains version one and replayable. |
| Physical Chrome device | Unverified — no external phone was connected to this workspace. |

Updated screenshots are in `docs/screenshots/`. The final browser pass used `PLAYWRIGHT_TRACE=off` because the C: drive has less than 250 MiB free. The public Supabase room was not used as a disposable integration database. The Supabase security advisor's [RLS-enabled/no-policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is intentional for server-only tables; browser clients never query the Supabase Data API. The new case index is currently an informational [unused-index notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) because the table is new.

## Previous release baseline

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
