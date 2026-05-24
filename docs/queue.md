# Queue

## Now
- [x] Complete the repository cleanup audit for archived, unused, and inefficient frontend artifacts.
- [ ] Finish private-alpha deploy readiness after a migrated remote `DATABASE_URL` is available and Azure CLI is logged in.

## Next
- [ ] Keep legacy backend compatibility routes until each has an explicit replacement and migrated tests.
- [ ] Revisit semantic embeddings only after Penny-native lexical and graph search prove insufficient.

## Later
- [ ] Expand only when the project grows.

## Blocked
- [ ] Hosted private-alpha deploy is blocked on the real Postgres `DATABASE_URL` GitHub secret and `az login` on this machine; the current `.env.local` database candidate fails `pnpm check:database-url-candidate`.
- [ ] Directly publicizing `picturesuo/Penny` is blocked by committed proof media; use the sanitized `picturesuo/penny-public` mirror unless those artifacts are reviewed/removed from private history.

## Discovered While Working
- [x] Removed unused frontend components, stale tests, dead CSS, and unused Create/Learn props.
- [x] Refreshed committed public frontend bundles after source and style changes.
- [x] Updated `docs/p3-deletion-gate.md` so resolved cleanup status matches the current code.
