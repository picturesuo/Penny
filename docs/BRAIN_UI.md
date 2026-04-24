# Brain UI

The Brain MVP screen lives at `/brain` and is implemented under `apps/web/components/brain/**` with its viewmodel in `apps/web/lib/viewmodels/brain/**`.

## Surface

- Main thought stream: renders the Brain projection `claims` as MVP thoughts.
- Thought stream rows are ordered by recent update and include a title, body preview, confidence preview, updated timestamp, and a lightweight confidence mini-graph.
- Selected thought card: mirrors `selectedClaim` or the current `claimId` from projection context.
- Selected claim panel: shows the selected claim title/body, confidence, related claims from the same projection, and a `View on Brain Map` action link.
- Claim inspector: shows selected thought status, IDs, confidence, and update time.
- Recent thoughts: derives the most recently updated thoughts from the same Brain projection payload.
- Map and sphere context: shows the projected map title and ID. The current backend projection does not expose a sphere, so the UI states `No sphere projected` rather than inventing one.
- Sphere/session affordances: shows a selected `Work sphere` derived from the current map and a recent sessions list derived from recent Brain projection activity. Session buttons expose selected state with `aria-pressed`.

## States

- Empty: shows the Brain frame, no-map/no-thought context, empty stream copy, and empty inspector copy.
- Populated: shows loaded thoughts, selected thought focus, inspector metadata, and recent thoughts.
- Loading: shows the same stable Brain frame with a loading status banner while the projection request is in flight.
- Error: shows the stable Brain frame with an alert status banner using the projection error message.

## Data Boundary

The route screen reads `GET /api/workspace/brain` with the same local UUID header pattern used by the current shell. It does not call AI provider code, does not import `server/ai/**`, and does not build Challenge or Learn views.

The viewmodel intentionally maps backend `claims` to UI `thoughts` for the Brain experience while preserving projection IDs, confidence, timestamps, and map context.
