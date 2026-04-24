# Brain UI

The Brain MVP screen lives at `/brain` and is implemented under `apps/web/components/brain/**` with its viewmodel in `apps/web/lib/viewmodels/brain/**`.

## Surface

- Main thought stream: renders the Brain projection `claims` as MVP thoughts.
- Thought stream rows are ordered by recent update and include a title, body preview, confidence preview, updated timestamp, and a lightweight confidence mini-graph.
- Selected thought card: mirrors `selectedClaim` or the current `claimId` from projection context.
- Selected claim panel: shows the selected claim title/body, confidence, related claims from the same projection, and a `View on Brain Map` action link.
- Claim inspector: shows selected thought status, IDs, confidence, update time, key connections, dependency context, contradiction markers, and recent activity.
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

Inspector sections are derived from the current Brain projection. Key connections and dependency previews use sibling claims and map context until the backend exposes first-class graph edges; contradiction markers flag low-confidence claims for review rather than inventing a challenge result.

The Brain fetch adapter reads both `GET /api/workspace/shell` and `GET /api/workspace/brain` with the UUID user header. The route uses those live endpoints by default.

## Interactions

- Selecting a claim updates local Brain selection and stores the selected `claimId` in the URL.
- Switching Brain / Challenge / Learn mode updates local mode state while preserving the selected `claimId` in the URL. The Brain screen does not build Challenge or Learn detail.
- `New Thought` is a placeholder action that announces the future creation flow without writing data.
- Acceptance coverage verifies that the selected claim panel remains visible when Challenge mode is selected from the Brain screen.

## Mock Data

Deterministic Brain mock data is gated to local/test runs by `NEXT_PUBLIC_ENABLE_BRAIN_MOCK=1`. With that flag set, `/brain?mock=1` or `/brain?brainMock=true` renders the fixture from `apps/web/lib/viewmodels/brain/mock-data.ts` without calling `GET /api/workspace/brain`.
