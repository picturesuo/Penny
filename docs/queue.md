# Queue

## Now
- [ ] Finish the request rate limiting slice so AI-calling routes and auth endpoints are throttled before the expensive work runs.

## Next
- [ ] Verify the AI entry points, auth routes, and founder brief path are all using the shared limiter.
- [ ] Check the 429 fallback shape so the app returns a clear retry-after response instead of a silent failure.

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
- [x] Rate limiting should be centralized and cheap, so the first pass uses an in-memory per-subject window before any AI work or auth mutation runs.
