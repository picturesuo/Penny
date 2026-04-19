# Queue

## Now
- [ ] Finish the error monitoring slice so unhandled client and server failures are logged with route, file, line, and user context instead of failing silently.

## Next
- [ ] Verify the error boundaries, request hooks, and route-level logging path on the new monitoring layer.
- [ ] Check the fallback copy against the honesty requirement: the app should say the error was logged, not pretend it was recovered.

## Later
- [ ] Expand only when the project grows.

## Blocked
- [ ] No blockers recorded yet.

## Discovered While Working
- [x] The landing page still leaned on startup-idea language at the top, so the smallest real artifact was to reframe the hero around the pressure-tested second brain.
- [x] Duplicate scratch artifacts (`docs/knowledge 2.md`, `docs/queue 2.md`, `.Rhistory`) were stray copies and are now removed.
- [x] The switching-cost layer was mostly expressed as generalized dashboards, so the named surfaces were reincorporated into the app dashboard and shape dashboard as explicit panels.
- [x] Vault mode was already present in the workspace (`src/components/penny/vault-modal.tsx` and the related server registration flow), so the queue item needed to be retired instead of re-implemented.
- [x] The lesson library should emerge from resolved claims and critique history rather than a separate note system, so the first build used the existing thought-map event log as the source of truth.
- [x] Global search had been scanning cross-user data and using margin fragments as a stand-in for lessons, so the search helper needed to be retargeted at the actual per-user archive surfaces.
- [x] Error monitoring needs to catch both client crashes and API failures, so the first implementation should combine App Router error boundaries with request-level reporting and keep the event payload user- and request-scoped.
