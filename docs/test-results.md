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
| Neon concurrent role claims, idempotency, rollback, and cleanup | Not run — 4 tests skipped without `NEON_TEST_DATABASE_URL` |
| Live four-device and QR scan | Awaiting deployed or shared-origin Neon environment |

Screenshots are saved in `docs/screenshots/` after the Playwright fixture suite runs.
