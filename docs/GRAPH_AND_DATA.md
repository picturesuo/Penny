# Graph And Data

This slice adds a frontend-owned graph and data layer without changing the shell, backend schema, or provider code.

## Owned Surface

- `apps/web/lib/types/**`: shared TypeScript contracts for workspace projections and graph models.
- `apps/web/lib/api/**`: typed fetch helpers for Penny API reads.
- `apps/web/lib/hooks/**`: mode-aware React hooks for shell, Brain, Challenge, and Learn projections.
- `apps/web/components/graph/**`: reusable graph adapters and presentation components.
- `tests/integration/frontend/**`: Node-based integration checks for API helpers and graph adapters.
- `tests/e2e/**`: dependency-light harness checks for graph selectors and data hook entrypoints.

## Data Flow

The frontend should consume server projections directly:

- `useShellView()` -> `GET /api/workspace/shell`
- `useBrainView()` -> `GET /api/workspace/brain`
- `useChallengeView()` -> `GET /api/workspace/challenge`
- `useLearnView()` -> `GET /api/workspace/learn`
- `useWorkspaceView(mode)` -> the matching mode projection

All helpers send a UUID-valued `x-user-id` header through the shared API client. Callers can pass a custom `userId` or a custom client for tests.

## Graph Model

The graph component accepts a `GraphModel`:

- nodes: typed by `kind` and `cluster`
- edges: source/target node links with optional label, status, and strength
- selected node: passed as `selectedNodeId` or stored on the model

Adapters are provided for the current projection shapes:

- `createBrainGraph(view)` maps the selected map and claims into a map-to-claims graph.
- `createChallengeGraph(view)` maps selected claim, latest round, critique state, and response state.
- `createLearnGraph(view)` maps the selected claim into the current Learn placeholder state.

## Visual Contract

`GraphView` is intentionally lightweight SVG:

- airy node-link layout
- muted cluster colors
- thin, low-contrast lines
- selected nodes get a stronger stroke and subtle shadow
- mini-map is pinned to the lower-right corner
- zoom and fit controls are pinned to the lower-left corner

The component exposes stable QA selectors:

- `data-testid="penny-graph"`
- `data-testid="penny-graph-node"`
- `data-testid="penny-graph-minimap"`

## Verification

Run the focused frontend checks with:

```bash
pnpm exec tsx --test tests/integration/frontend/*.test.ts tests/e2e/*.test.ts
```

This harness avoids adding a browser dependency for now. When a browser runner is introduced, use the same selectors above for a real viewport smoke that verifies graph rendering, zoom controls, fit reset, selected state, and mini-map visibility.
