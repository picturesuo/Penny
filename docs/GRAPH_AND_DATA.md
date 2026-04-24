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

## Mock-First Data

Use `mock-graph-data.ts` before wiring the graph into live workspace projections:

- `mockGraph`: combined graph fixture that exercises map, claim, challenge, critique, event, and learn clusters.
- `mockGraphs.brain`: Brain graph generated from `mockBrainView`.
- `mockGraphs.challenge`: Challenge graph generated from `mockChallengeView`.
- `mockGraphs.learn`: Learn graph generated from `mockLearnView`.

The selected mock node is `mock-claim-distribution`, which gives the canvas a stable selected-state target for screenshot and interaction tests.

## Graph Primitives

`GraphView` remains the high-level wrapper, but the presentation layer is split into reusable primitives:

- `BrainGraphMap`: large Brain-mode map context for the main map view.
- `ContextGraphView`: compact graph context for side panels.
- `GraphCanvas`: owns the SVG world, viewport transform, edges, nodes, and cluster labels.
- `GraphNode`: renders one accessible node target and its label.
- `GraphEdge`: renders one thin node-link connection.
- `GraphLegend`: renders muted cluster swatches.
- `MiniMap`: renders the lower-right overview.
- `SidePanelMiniMap`: inline mini-map variant for side panels.
- `ZoomControls`: renders zoom in, zoom out, and fit controls.
- `ClusterLabel`: renders lightweight labels for repeated clusters.
- `SelectedNodeHalo`: renders the subtle selected-state emphasis behind active nodes.

## Graph Contexts

Use the graph components in two contexts before live shell wiring:

- Brain large map view: render `BrainGraphMap` with `mockGraphs.brain` or a graph produced by `createBrainGraph(view)`.
- Side panels: render `ContextGraphView` for a compact local graph, or `SidePanelMiniMap` when the panel only needs an overview.

The side-panel variants intentionally omit the full legend and zoom rail so they stay quiet in dense panels.

## Visual Contract

`GraphView` is intentionally lightweight SVG:

- airy node-link layout
- light canvas background with a quiet green-tinted wash
- muted cluster colors with separate fill, stroke, and accent values
- thin, low-opacity lines that only strengthen slightly near selected nodes
- selected nodes get a soft halo, muted accent stroke, and gentle hover/focus states
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
