# Penny UI

## Frontend Shell

The current MVP UI lives in `apps/web/app/page.tsx` and `apps/web/components/penny-shell.tsx`.

The shell consumes the backend workspace projection routes:

- `GET /api/workspace/shell`
- `GET /api/workspace/brain`
- `GET /api/workspace/challenge`
- `GET /api/workspace/learn`

The UI sends a UUID-valued `x-user-id` header so the existing route auth helper accepts local projection requests. The mode switcher changes which projection endpoint is read; breadcrumb content, selected map, selected claim, critique status, and Learn placeholder state all come from the projection payloads.

## Brain Screen

The Brain screen reads `GET /api/workspace/brain` through the shell projection loader.

- Map title comes from `mapSummary.title`.
- Claim rows come from `claims`.
- The selected claim comes from `selectedClaim`.
- Claim creation posts to `POST /api/commands/claims/create` when a selected map exists.
- Claim selection posts to `POST /api/commands/workspace/select`, which wraps `setWorkspaceSelection`.

After claim creation or selection succeeds, the shell reloads the active projection so the visible selected claim and breadcrumb remain backend-derived.

## Screen Contract

- Top bar: Penny placeholder mark and name.
- Mode switcher: Brain, Challenge, and Learn controls.
- Breadcrumb area: renders `breadcrumb` / `breadcrumbItems` from the shell or active projection context.
- Main content: renders mode-specific projection data without creating frontend-only workspace state.

The empty-state path is intentional. If the local database has no `workspace_contexts` row for the UI user id, the shell renders `No workspace selected` and the mode screens show the empty projection response.
