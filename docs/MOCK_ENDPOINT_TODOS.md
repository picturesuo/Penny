# Mock Endpoint TODOs

This log tracks remaining frontend-visible mock or placeholder surfaces after the frontend/backend connection audit.

- TODO: `GET /api/workspace/learn` returns a real authenticated projection, but `learnState.status` is still `placeholder` with `Learn mode coming soon`. Replace this with persisted Learn concepts/exercises once that backend model exists.
- TODO: `/ai/*` routes may use the deterministic mock AI provider when provider API keys are not configured. The endpoints are real and persist/log where implemented, but local no-key output is not model-backed.
- TODO: `apps/web/lib/viewmodels/brain/mock-data.ts` and `apps/web/components/graph/mock-graph-data.ts` remain as test/demo fixtures. Live app routes should not use them unless an explicit local/test mock flag is set.
