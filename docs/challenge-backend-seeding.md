# Challenge Backend Seeding

Penny now has a dedicated workspace-backend seed path for challenge data.

It seeds compact but realistic records into the Postgres/Drizzle backend tables used by the challenge flow:

- `profiles`
- `spheres`
- `maps`
- `claims`
- `workspace_contexts`
- `challenge_rounds`
- `challenge_critiques`
- `moves_events`
- `challenge_critique_job_attempts`

There is no separate `ai_runs` table in the current backend. The seed populates the backing data that the internal AI-run surfaces already read:

- generated runs via `challenge_critiques`
- requested-only runs via `moves_events`
- `_aiRun` metadata embedded under `challenge_critiques.validated_output`

## Safety

This seed path is intentionally blocked for production-shaped environments.

Allowed targets:

- `local`
- `staging`

Blocked automatically when any of these environment markers say `production`:

- `PENNY_ENVIRONMENT`
- `APP_ENV`
- `SENTRY_ENVIRONMENT`
- `VERCEL_ENV`

## Commands

Dry run:

```bash
npx tsx src/scripts/seed-challenge-backend.ts --target local --dry-run
```

Local seed:

```bash
POSTGRES_URL=postgres://localhost:5432/penny \
  npx tsx src/scripts/seed-challenge-backend.ts --target local
```

Staging seed:

```bash
POSTGRES_URL=postgres://staging-host:5432/penny \
  PENNY_ENVIRONMENT=staging \
  npx tsx src/scripts/seed-challenge-backend.ts --target staging
```

## Fixture shape

The seeded dataset is compact and repeatable:

- 2 workspace users
- 2 spheres
- 2 maps
- 5 claims
- 3 challenge rounds
- 2 generated critiques
- 5 critique job attempts
- 21 moves/events

It includes:

- one completed challenge round with a recorded response and confidence change
- one pending challenge round with a failed attempt plus a queued retry
- one challenge round with a validation-failed attempt followed by a successful retry

## Example generated data

Example summary output:

```json
{
  "target": "local",
  "dryRun": false,
  "users": 2,
  "maps": 2,
  "claims": 5,
  "critiques": 2,
  "events": 21,
  "aiRuns": {
    "generated": 2,
    "requestedOnly": 3
  },
  "rounds": {
    "total": 3,
    "closed": 1,
    "open": 2
  }
}
```

Example seeded records:

- `Maya Chen` on `Go-to-market thesis`
  - claim: `Distribution advantage matters more than model quality in this market.`
  - round 1: generated and responded
  - round 2: retry queued after a failed generation
- `Alex Rivera` on `Consumer habit thesis`
  - claim: `Daily AI journaling can become a durable consumer habit without a social graph.`
  - round 1: validation failure followed by successful generated critique

## Repeatability

The seed uses fixed IDs for the fixture users and deletes only those seeded users before re-inserting the bundle.

That means:

- running it again is deterministic
- it does not wipe unrelated workspace data
- fixture references remain stable across local and staging replays
