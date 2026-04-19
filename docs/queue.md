# Queue

## Now
- [x] Build the challenge round UI between the steel-man gate and round persistence.
- [x] Build the global navigation.

## Next
- [ ] Re-scan the remaining type files for any loose nullable fields or server-populated fields that are still not reflected in the public types.
- [x] Keep the shared context aligned with the challenge-round slice before moving to another feature area.

## Later
- [ ] Expand only when the project grows.

## Blocked
- [ ] No blockers recorded.

## Discovered While Working
- [x] The landing page still leaned on startup-idea language at the top, so the smallest real artifact was to reframe the hero around the pressure-tested second brain.
- [x] Duplicate scratch artifacts (`docs/knowledge 2.md`, `docs/queue 2.md`, `.Rhistory`) were stray copies and are now removed.
- [x] The switching-cost layer was mostly expressed as generalized dashboards, so the named surfaces were reincorporated into the app dashboard and shape dashboard as explicit panels.
- [x] Vault mode was already present in the workspace (`src/components/penny/vault-modal.tsx` and the related server registration flow), so the queue item needed to be retired instead of re-implemented.
- [x] The lesson library should emerge from resolved claims and critique history rather than a separate note system, so the first build used the existing thought-map event log as the source of truth.
- [x] Global search had been scanning cross-user data and using margin fragments as a stand-in for lessons, so the search helper needed to be retargeted at the actual per-user archive surfaces.
- [x] Error monitoring needs to catch both client crashes and API failures, so the first implementation should combine App Router error boundaries with request-level reporting and keep the event payload user- and request-scoped.
- [x] Rate limiting should be centralized and cheap, so the first pass uses an in-memory per-subject window before any AI work or auth mutation runs.
- [x] The type audit found that session status should be normalized to the actual lifecycle union and that session summaries should always carry a key insight once generated.
- [x] The MVP core types need to follow the real runtime shapes, so `Map` uses `rawThought` plus `claimCount`, `Claim` models thought nodes plus capture metadata, `SteelMan` uses the persisted quality-score fields, and `Artifact` / `Move` should follow the actual record and event unions instead of the sketch draft.
- [x] The MVP core contracts now have dedicated Prisma tables and indexes, and the sqlite dev database was recreated cleanly after the old zero-byte `dev.db` file caused Prisma drift.
- [x] Every API route should validate params, query, and body inputs with shared Zod schemas before touching the server layer; route IDs should use `cuid()` because the repo uses cuid-backed record IDs.
- [x] Map creation now uses the shared `CreateMapSchema` + `createMap` path and returns the created map wrapper, while claim creation now lists existing claims, validates the capture payload, and records the new claim as an applied move.
- [x] The steel-man gate should sit between claim capture and the first critique round, save the user’s strongest opposing view through the existing steel-man route, surface a quality assessment, and allow an explicit skip path that does not dead-end the flow.
- [x] The challenge round UI should be its own component, but the response still needs to persist through the existing dialectic-round flow with the schema-aligned 10-character minimum.
