# Testing

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

## Reading Failures

The test names are written as acceptance statements. When `pnpm test:mvp` fails, start with the failing test name:

- `backend acceptance flow preserves...` means the Brain, Challenge, Learn, or return-to-Brain state loop regressed.
- `does not expose another user's selected map` means read-side ownership isolation regressed.
- `rejects a claim owned by another user` means Challenge ownership isolation regressed.
- `returns 403 when the round belongs to another user` means response ownership isolation regressed.
- `replays the original result for the same request...` means idempotent retry behavior regressed.

The Postgres `57P01` shutdown warnings in passing runs come from intentionally stopping temporary test clusters.
