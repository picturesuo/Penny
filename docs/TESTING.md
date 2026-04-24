# Testing

## Automated Commands

Run the focused MVP frontend-flow contract tests:

```bash
pnpm exec tsx --test tests/e2e/mvp-frontend-flow.test.ts
```

This suite checks the current frontend flow surface without adding product behavior:

- Brain onboarding card links into Brain mode
- Brain capture form submits through the current claim command path and shows the created item in Brain
- selecting a Brain item preserves the selected claim for downstream work
- Extract Claims reaches the `/ai/extract-claims` endpoint contract and Brain displays returned claims
- graph node selection updates the inspector contract
- confidence changes post through `/api/confidence`
- `Cmd+K` / `Ctrl+K` opens the command palette
- mocked `/api/search` results normalize into command-palette results
- Challenge and Learn have their AI endpoint contracts and visible result sections
- one loading state, one retryable error state, and the thoughts / graph / search / inspector empty states render

Run the backend MVP state-loop pass:

```bash
pnpm test:mvp
```

Run the broader MVP verification bundle:

```bash
pnpm test:mvp-verification
```

Run project checks:

```bash
pnpm db:typecheck
pnpm typecheck
pnpm lint
pnpm build
```

## MVP State Loop

Run the no-AI MVP acceptance pass with:

```bash
pnpm test:mvp
```

This command verifies the current backend and UI-state loop without live AI provider calls:

- create map
- create claim
- select Brain and fetch the Brain projection
- switch to Challenge
- start a challenge round
- request the pending critique placeholder
- fetch the Challenge projection
- record a challenge response
- switch to Learn and fetch the Learn projection
- switch back to Brain
- assert the same `mapId` and `claimId` are preserved throughout

The same command also verifies:

- required event rows: `map.created`, `claim.created`, `workspace.selection.changed`, `challenge.round.started`, `challenge.critique.requested`, and `challenge.response.recorded`
- ownership boundaries: user B cannot read user A's Brain map, challenge user A's claim, or respond to user A's round
- idempotent retry behavior for duplicate claim creation and duplicate critique requests

## Requirements

`pnpm test:mvp` starts temporary local Postgres clusters for the integration tests. The local machine needs:

- Node.js and pnpm installed
- Postgres CLI tools available on `PATH`: `initdb`, `pg_ctl`, and `createdb`

No AI provider credentials are required for this MVP pass.

## Manual MVP Path

Use this path for a quick human smoke test after migrations and seed data are available:

1. Run `pnpm db:migrate`.
2. Run `pnpm db:seed`.
3. Run `pnpm dev`.
4. Open `http://localhost:3000/app?mode=brain`.
5. Click the Brain entry card if starting from onboarding.
6. Capture one thought or claim in Brain and confirm it appears in the stream.
7. Select the new item and confirm the graph selection and inspector update.
8. Change confidence and confirm the control reflects the new value.
9. Open search with `Cmd+K` or `Ctrl+K`; search for an existing map, thought, or claim.
10. Switch to Challenge and confirm the selected claim stays in context.
11. Switch to Learn and confirm the selected claim stays in context.

Use the browser network panel during manual AI checks to confirm calls to `/ai/extract-claims`, `/ai/challenge-idea`, and `/ai/explain-blocker` once those controls are exposed in the product surface.

## Known Gaps

- `tests/e2e/mvp-frontend-flow.test.ts` is a source-level and server-rendered contract suite, not a Playwright browser-click suite.
- The current Brain UI uses the tracked claim command path for capture; a distinct browser control named `Extract Claims` is not yet exposed.
- Challenge and Learn UI result sections are covered, and their AI routes are covered, but the current UI does not directly call `/ai/challenge-idea` or `/ai/explain-blocker`.
- Manual verification is still needed for real browser focus behavior, pointer events on the graph, and network-panel confirmation of AI calls.
- `pnpm test:mvp` requires local Postgres CLI tools.

## Reading Failures

The test names are written as acceptance statements. When `pnpm test:mvp` fails, start with the failing test name:

- `backend acceptance flow preserves...` means the Brain, Challenge, Learn, or return-to-Brain state loop regressed.
- `does not expose another user's selected map` means read-side ownership isolation regressed.
- `rejects a claim owned by another user` means Challenge ownership isolation regressed.
- `returns 403 when the round belongs to another user` means response ownership isolation regressed.
- `replays the original result for the same request...` means idempotent retry behavior regressed.

The Postgres `57P01` shutdown warnings in passing runs come from intentionally stopping temporary test clusters.
