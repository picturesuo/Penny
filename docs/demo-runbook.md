# Penny Demo Runbook

Use this runbook for a local Thinking Mode demo against the API-served app at port 3000. The commands assume the repo root is `/Users/bensuo/Desktop/penny`.

## 1. Setup Command

```bash
cd /Users/bensuo/Desktop/penny
pnpm install
set -a
source .env.local
set +a
pnpm db:migrate
pnpm build:frontend
```

For the most reliable local demo, leave `XAI_API_KEY` unset so the seed path uses the deterministic heuristic provider. Set `XAI_API_KEY` only when intentionally demoing live model generation.

## 2. Seed Command

Start the API first in another terminal using the dev command below, then run:

```bash
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export DEMO_BRAIN_ID="${DEMO_BRAIN_ID:-00000000-0000-4000-8000-000000000900}"
export DEMO_RAW_IDEA="I think pre-seed founders will pay for a structured thinking autopilot before traction because founder decisions are messy and ChatGPT loses the thread. Penny should map the idea, find weak assumptions, challenge them, and leave me with something I can actually use."

curl -sS -X POST "$BASE_URL/brain/seed" \
  -H "content-type: application/json" \
  -H "idempotency-key: demo-seed-001" \
  -d "{\"rawIdea\":\"$DEMO_RAW_IDEA\",\"userId\":\"demo-user\",\"workspaceId\":\"demo-workspace\",\"projectId\":\"demo-project\",\"sphereId\":\"demo-sphere\"}" \
  | tee /tmp/penny-demo-seed.json

export DEMO_SESSION_ID="$(
  node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("/tmp/penny-demo-seed.json","utf8")).data.session.id)'
)"
```

## 3. Dev Command

```bash
cd /Users/bensuo/Desktop/penny
set -a
source .env.local
set +a
PORT=3000 pnpm dev:api
```

Expected server log:

```text
Penny cockpit listening on http://localhost:3000
```

## 4. Smoke Command

Non-mutating guard smoke:

```bash
BASE_URL=http://localhost:3000 ./scripts/smoke-thinking-mode.sh
```

Optional mutating API smoke after seeding:

```bash
curl -sS "$BASE_URL/api/brains/$DEMO_BRAIN_ID/autopilot/state?sessionId=$DEMO_SESSION_ID" \
  | tee /tmp/penny-demo-state-before.json

curl -sS -X POST "$BASE_URL/api/brains/$DEMO_BRAIN_ID/autopilot/tick" \
  -H "content-type: application/json" \
  -d "{\"sessionId\":\"$DEMO_SESSION_ID\",\"limit\":3}" \
  | tee /tmp/penny-demo-tick.json

export DEMO_CANDIDATE_ID="$(
  node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("/tmp/penny-demo-tick.json","utf8")).data.selectedCandidate.candidateId)'
)"

curl -sS -X POST "$BASE_URL/api/next-move-candidates/$DEMO_CANDIDATE_ID/start" \
  -H "content-type: application/json" \
  -d "{\"brainId\":\"$DEMO_BRAIN_ID\",\"sessionId\":\"$DEMO_SESSION_ID\"}" \
  | tee /tmp/penny-demo-start.json

export DEMO_MANUAL_CLAIM_ID="$(
  node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("/tmp/penny-demo-tick.json","utf8")).data.candidates.at(-1).targetClaimId)'
)"

curl -sS -X POST "$BASE_URL/api/brains/$DEMO_BRAIN_ID/focus/manual" \
  -H "content-type: application/json" \
  -d "{\"sessionId\":\"$DEMO_SESSION_ID\",\"claimId\":\"$DEMO_MANUAL_CLAIM_ID\",\"reason\":\"Demo manual override.\"}" \
  | tee /tmp/penny-demo-manual.json
```

## 5. Demo URL

Open:

```text
http://localhost:3000
```

Use the API-served app on port 3000 for the demo. `pnpm dev:frontend` serves Vite on port 5173 and proxies `/api`, `/brain`, and `/autopilot` to the API server on port 3000 by default.

## 6. Expected API Outputs

`POST /brain/seed`

- HTTP `201`.
- `data.session.id` is a UUID; export it as `DEMO_SESSION_ID`.
- `data.ideaMap.claims` has generated claims.
- `data.ideaMap.edges` has typed graph edges.
- `data.firstChallenge.responseOptions` is `["Defend","Revise","Absorb"]`.
- `data.moves` includes `source.recorded`, `seed_claim_created`, `assumptions_extracted`, and `first_challenge_suggested`.

`GET /api/brains/:brainId/autopilot/state?sessionId=:sessionId`

- HTTP `200`.
- `data.status` is `empty`, `ready`, or `paused`.
- `data.focusState.sessionId` matches `DEMO_SESSION_ID`.
- Before tick, `data.candidates` may be empty.

`POST /api/brains/:brainId/autopilot/tick`

- HTTP `201`.
- `data.status` is usually `ready`.
- `data.selectedCandidate.reason` explains why Penny chose the next move.
- `data.selectedCandidate.exitCriteria` is present.
- `data.move.kind` is `next_move_recomputed`.
- `data.focusState.source` is `autopilot_suggestion`.

`POST /api/next-move-candidates/:candidateId/start`

- HTTP `201`.
- `data.status` is `started`.
- `data.move.kind` is `autopilot_focus_started`.
- `data.focusState.source` is `autopilot_started`.

`POST /api/brains/:brainId/focus/manual`

- HTTP `201`.
- `data.status` is `paused`.
- `data.move.kind` is `manual_node_selected`.
- `data.focusState.paused` is `true`.
- `data.focusState.source` is `manual_selection`.

`POST /api/sessions/:sessionId/challenge-brief`

- HTTP `201` after enough session state exists.
- `data.artifact.kind` is `challenge_brief`.
- `data.move.kind` is `artifact_created`.
- `data.brief.sections` includes original idea, selected pressure point, challenge, response, what changed, open risks, and recommended next move.

## 7. Common Failures

- `DATABASE_URL is required`: `.env.local` was not sourced in the terminal running `pnpm dev:api`.
- `relation ... does not exist` or enum errors: run `pnpm db:migrate` against the same `DATABASE_URL`.
- Port `3000` already in use: stop the old process or run `PORT=3001 pnpm dev:api` and set `BASE_URL=http://localhost:3001`.
- Seed returns provider/network errors: unset `XAI_API_KEY` for the deterministic heuristic demo, or verify the xAI key/model if intentionally using live AI.
- `GET /brain/seed` or `GET /autopilot/tick` returns `405`: this is expected; these mutation surfaces are POST-only.
- Vite app on `5173` cannot call Autopilot APIs: verify `pnpm dev:api` is running on port `3000`, or set `PENNY_API_ORIGIN` before `pnpm dev:frontend` if the API uses another port.
- `thinking_mode_not_found`: the `DEMO_SESSION_ID` was not exported from the seed response or the database was reset after seeding.
- `invalid_request`: check that UUID values are valid and request bodies have `content-type: application/json`.

## 8. Reset Command

This clears demo data while keeping migrations intact:

```bash
cd /Users/bensuo/Desktop/penny
set -a
source .env.local
set +a
node --input-type=module -e '
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await sql.unsafe(`
  truncate table
    command_idempotency_keys,
    wiki_pages,
    artifacts,
    challenge_rounds,
    derived_effects,
    shapes,
    next_move_candidates,
    focus_states,
    source_spans,
    claim_edges,
    claim_versions,
    claims,
    sources,
    brain_runs,
    moves,
    sessions
  restart identity cascade
`);
await sql.end();
'
```

Re-run `pnpm db:migrate` after reset if the database itself was recreated.
