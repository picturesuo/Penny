#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://localhost:3000}"
tmp_dir="$(mktemp -d)"
server_pid=""
postgres_dir=""
postgres_port="${SMOKE_DB_PORT:-55439}"
postgres_db="${SMOKE_DB_NAME:-penny_smoke}"
isolated_db="${SMOKE_ISOLATED_DB:-0}"
smoke_id="smoke-$(date +%s)-$$"
checker="$tmp_dir/check-smoke.cjs"
response_file=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" >/dev/null 2>&1 || true
  fi

  if [[ -n "$postgres_dir" ]]; then
    pg_ctl -D "$postgres_dir" -m fast -w stop >/dev/null 2>&1 || true
  fi

  rm -rf "$tmp_dir"
}

trap cleanup EXIT

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

load_local_env() {
  if [[ -z "${DATABASE_URL:-}" && -f ".env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ".env.local"
    set +a
  fi
}

choose_postgres_port() {
  local start_port="${SMOKE_DB_PORT:-55439}"

  if [[ ! "$start_port" =~ ^[0-9]+$ ]]; then
    echo "SMOKE_DB_PORT must be a numeric port." >&2
    exit 1
  fi

  postgres_port="$start_port"

  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  local candidate
  for ((candidate = start_port; candidate < start_port + 50; candidate += 1)); do
    if ! lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; then
      postgres_port="$candidate"
      return
    fi
  done

  echo "No available PostgreSQL smoke port found from $start_port to $((start_port + 49))." >&2
  exit 1
}

start_isolated_db() {
  require_command initdb
  require_command pg_ctl
  require_command createdb
  require_command psql

  choose_postgres_port
  postgres_dir="$tmp_dir/postgres"

  echo "Starting isolated PostgreSQL smoke database at localhost:$postgres_port"
  initdb -D "$postgres_dir" -A trust >"$tmp_dir/initdb.log" 2>&1
  pg_ctl -D "$postgres_dir" -o "-p $postgres_port" -w start >"$tmp_dir/postgres.log" 2>&1
  createdb -h localhost -p "$postgres_port" "$postgres_db"

  for migration in drizzle/*.sql; do
    psql -h localhost -p "$postgres_port" -d "$postgres_db" -v ON_ERROR_STOP=1 -f "$migration" >>"$tmp_dir/migrations.log" 2>&1
  done

  export DATABASE_URL="postgresql://localhost:$postgres_port/$postgres_db"
}

server_port() {
  if [[ -n "${PORT:-}" ]]; then
    echo "$PORT"
    return
  fi

  if [[ "$base_url" =~ :([0-9]+)($|/) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi

  echo "3000"
}

server_ready() {
  curl -fsS "$base_url/" >/dev/null 2>&1
}

wait_for_server() {
  for _ in {1..60}; do
    if server_ready; then
      return 0
    fi

    sleep 0.5
  done

  return 1
}

start_server_if_needed() {
  if server_ready; then
    if [[ "$isolated_db" == "1" ]]; then
      echo "SMOKE_ISOLATED_DB=1 requires BASE_URL to point at an unused port." >&2
      exit 1
    fi

    echo "Using existing Penny dev server at $base_url"
    return
  fi

  if [[ "$isolated_db" == "1" ]]; then
    start_isolated_db
  else
    load_local_env
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required to start the Penny API for the full smoke test." >&2
    echo "Export it or add it to .env.local, then run: pnpm db:migrate" >&2
    echo "Or run with SMOKE_ISOLATED_DB=1 to use a temporary migrated PostgreSQL database." >&2
    exit 1
  fi

  local port
  local penny_auto_migrate="${PENNY_AUTO_MIGRATE:-}"

  if [[ "$isolated_db" == "1" && -z "$penny_auto_migrate" ]]; then
    penny_auto_migrate="0"
  fi

  port="$(server_port)"
  echo "Starting Penny dev server at $base_url"

  if [[ -n "$penny_auto_migrate" ]]; then
    PORT="$port" PENNY_AUTO_MIGRATE="$penny_auto_migrate" XAI_API_KEY="" pnpm dev:api >"$tmp_dir/dev-server.log" 2>&1 &
  else
    PORT="$port" XAI_API_KEY="" pnpm dev:api >"$tmp_dir/dev-server.log" 2>&1 &
  fi

  server_pid="$!"

  if ! wait_for_server; then
    echo "Penny dev server did not become ready." >&2
    cat "$tmp_dir/dev-server.log" >&2 || true
    exit 1
  fi
}

write_checker() {
  cat >"$checker" <<'NODE'
const fs = require("node:fs");
const assert = require("node:assert/strict");

const [command, ...args] = process.argv.slice(2);

function read(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function payload(file) {
  return read(file).data;
}

function valueAt(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function claimMap(graph) {
  return new Map(graph.ideaMap.claims.map((claim) => [claim.id, claim]));
}

function assertOriginalClaimsUnchanged(initialGraph, currentGraph, options = {}) {
  const currentClaims = claimMap(currentGraph);
  const allowedClaimId = options.allowedClaimId ?? null;

  for (const initialClaim of initialGraph.ideaMap.claims) {
    const currentClaim = currentClaims.get(initialClaim.id);

    assert.ok(currentClaim, `missing original claim ${initialClaim.id}`);

    if (initialClaim.id === allowedClaimId) {
      assert.equal(currentClaim.text, options.expectedText);
      assert.notEqual(currentClaim.versionId, initialClaim.versionId);
      assert.ok(
        currentClaim.versions.some((version) => version.id === initialClaim.versionId && version.state === "old"),
        "revised claim should preserve the old ClaimVersion",
      );
      assert.ok(
        currentClaim.versions.some((version) => version.id === currentClaim.versionId && version.state === "current"),
        "revised claim should expose a new current ClaimVersion",
      );
      continue;
    }

    assert.equal(currentClaim.text, initialClaim.text, `claim text changed unexpectedly for ${initialClaim.id}`);
    assert.equal(currentClaim.versionId, initialClaim.versionId, `claim version changed unexpectedly for ${initialClaim.id}`);
    assert.equal(currentClaim.confidence, initialClaim.confidence, `claim confidence changed unexpectedly for ${initialClaim.id}`);
  }
}

switch (command) {
  case "value": {
    const [file, path] = args;
    const value = valueAt(read(file), path);

    if (value === undefined || value === null) {
      process.exit(1);
    }

    process.stdout.write(String(value));
    break;
  }
  case "manual-claim-id": {
    const [file, targetClaimId] = args;
    const seed = payload(file);
    const claim = seed.ideaMap.claims.find((item) => item.id !== targetClaimId);

    assert.ok(claim, "expected a non-target claim for manual override");
    process.stdout.write(claim.id);
    break;
  }
  case "seed": {
    const seed = payload(args[0]);

    assert.match(seed.session.id, /^[0-9a-f-]{36}$/);
    assert.equal(seed.session.status, "open");
    assert.ok(seed.ideaMap.claims.length >= 4, "seed graph should include claims");
    assert.ok(seed.ideaMap.edges.length >= 3, "seed graph should include edges");
    assert.match(seed.firstChallenge.targetClaimId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(seed.firstChallenge.responseOptions, ["Defend", "Revise", "Absorb"]);
    break;
  }
  case "state": {
    const state = payload(args[0]);

    assert.match(state.sessionId, /^[0-9a-f-]{36}$/);
    assert.ok(["empty", "ready", "paused"].includes(state.status));
    assert.ok(Array.isArray(state.candidates));
    break;
  }
  case "moves-same": {
    const before = payload(args[0]);
    const after = payload(args[1]);

    assert.equal(after.moves.length, before.moves.length, "GET requests should not append Moves");
    break;
  }
  case "tick": {
    const tick = payload(args[0]);

    assert.equal(tick.status, "ready");
    assert.equal(tick.move.kind, "next_move_recomputed");
    assert.equal(tick.focusState.source, "autopilot_suggestion");
    assert.ok(tick.candidates.length > 0, "tick should return candidates");
    assert.ok(tick.selectedCandidate, "tick should select a candidate");
    assert.ok(unique(tick.candidates.map((candidate) => candidate.candidateId)), "candidate IDs should be unique");
    assert.ok(tick.selectedCandidate.reason.length > 0);
    assert.ok(tick.selectedCandidate.exitCriteria.acceptedMoveKinds.length > 0);
    assert.ok(typeof tick.selectedCandidate.scoreBreakdown.leverage === "number");
    assert.equal(tick.selectedCandidate.provenance.graphHash, tick.selectedCandidate.graphHash);
    break;
  }
  case "no-duplicate-candidates": {
    const first = payload(args[0]);
    const second = payload(args[1]);
    const state = payload(args[2]);

    assert.equal(
      second.selectedCandidate.candidateId,
      first.selectedCandidate.candidateId,
      "repeated tick should update the same selected candidate identity",
    );
    assert.ok(unique(state.candidates.map((candidate) => candidate.candidateId)), "state should not contain duplicate candidate IDs");
    assert.ok(unique(state.candidates.map((candidate) => candidate.fingerprint)), "state should not contain duplicate fingerprints");
    break;
  }
  case "start": {
    const started = payload(args[0]);

    assert.equal(started.status, "started");
    assert.equal(started.focusState.source, "autopilot_started");
    assert.equal(started.focusState.paused, false);
    assert.equal(started.move.kind, "autopilot_focus_started");
    break;
  }
  case "manual": {
    const manual = payload(args[0]);

    assert.equal(manual.status, "paused");
    assert.equal(manual.focusState.source, "manual_selection");
    assert.equal(manual.focusState.paused, true);
    assert.equal(manual.move.kind, "manual_node_selected");
    break;
  }
  case "issue": {
    const issued = payload(args[0]);

    assert.equal(issued.status, "issued");
    assert.equal(issued.move.kind, "challenge_issued");
    assert.match(issued.challengeRound.id, /^[0-9a-f-]{36}$/);
    assert.ok(["weak", "moderate", "strong"].includes(issued.strength));
    assert.ok(issued.critique.length > 0);
    assert.ok(issued.whyThis.length > 0);
    break;
  }
  case "respond": {
    const [file, responseKind] = args;
    const response = payload(file);
    const expectedMoveKind = {
      defend: "user_defended",
      revise: "claim_revised",
      absorb: "critique_absorbed",
    }[responseKind];

    assert.equal(response.status, "responded");
    assert.equal(response.response, responseKind);
    assert.equal(response.move.kind, expectedMoveKind);
    assert.equal(response.focusCompletedMove.kind, "focus_completed");
    assert.equal(response.receipt.response, responseKind);
    assert.equal(response.receipt.claimTextChanged, responseKind === "revise");
    assert.equal(response.receipt.unresolvedRisk, responseKind === "absorb");
    assert.equal(response.nextMove.status, "client_tick_required");
    assert.equal(response.nextMove.requiredCommand, "tick_autopilot");
    assert.equal(response.nextMove.method, "POST");
    assert.equal(response.nextMove.body.resume, true);
    assert.equal(response.nextMove.expectedMoveKind, "next_move_recomputed");
    assert.match(response.nextMove.endpoint, /^\/api\/sessions\/[0-9a-f-]{36}\/autopilot\/tick$/);
    break;
  }
  case "brief": {
    const brief = payload(args[0]);

    assert.equal(brief.status, "created");
    assert.equal(brief.artifact.kind, "challenge_brief");
    assert.equal(brief.move.kind, "artifact_created");
    assert.equal(brief.brief.kind, "challenge_brief");
    assert.ok(brief.brief.refs.claimIds.length > 0);
    break;
  }
  case "claims-unchanged": {
    assertOriginalClaimsUnchanged(payload(args[0]), payload(args[1]));
    break;
  }
  case "claims-after-revise": {
    assertOriginalClaimsUnchanged(payload(args[0]), payload(args[1]), {
      allowedClaimId: args[2],
      expectedText: args[3],
    });
    break;
  }
  default:
    throw new Error(`Unknown smoke checker command: ${command}`);
}
NODE
}

status_for() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local output="$4"

  if [[ -n "$body" ]]; then
    curl -sS -o "$output" -w "%{http_code}" \
      -X "$method" \
      -H "content-type: application/json" \
      -H "idempotency-key: $smoke_id" \
      -d "$body" \
      "$base_url$path"
    return
  fi

  curl -sS -o "$output" -w "%{http_code}" \
    -X "$method" \
    "$base_url$path"
}

request_json() {
  local name="$1"
  local expected="$2"
  local method="$3"
  local path="$4"
  local body="${5:-}"
  local output="$tmp_dir/$name.json"
  local actual

  actual="$(status_for "$method" "$path" "$body" "$output")"

  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $method $path to return $expected, got $actual." >&2
    cat "$output" >&2 || true
    if [[ -n "$server_pid" ]]; then
      echo "--- dev server log ---" >&2
      cat "$tmp_dir/dev-server.log" >&2 || true
    fi
    exit 1
  fi

  response_file="$output"
  echo "ok $method $path -> $actual"
}

expect_status() {
  local expected="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local output="$tmp_dir/$(echo "$method-$path" | tr '/:?=&' '_____').txt"
  local actual

  actual="$(status_for "$method" "$path" "$body" "$output")"

  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $method $path to return $expected, got $actual." >&2
    cat "$output" >&2 || true
    exit 1
  fi

  echo "ok $method $path -> $actual"
}

json_value() {
  node "$checker" value "$1" "$2"
}

json_check() {
  node "$checker" "$@"
}

require_command curl
require_command node
require_command pnpm
write_checker
start_server_if_needed

echo "Smoke testing Thinking Mode at $base_url"

expect_status "200" "GET" "/"
expect_status "405" "GET" "/brain/seed"
expect_status "405" "GET" "/api/sessions/00000000-0000-4000-8000-000000000101/autopilot/tick"
expect_status "400" "POST" "/api/sessions/not-a-uuid/autopilot/tick" '{}'

seed_body='{"rawIdea":"Pre-seed founders will pay for structured thinking before traction because founder decisions are messy and generic chat tools lose the thread.","userId":"smoke-user","workspaceId":"smoke-workspace","projectId":"smoke-project","sphereId":"smoke-sphere"}'
request_json "seed" "201" "POST" "/brain/seed" "$seed_body"
seed_file="$response_file"
json_check "seed" "$seed_file"

session_id="$(json_value "$seed_file" "data.session.id")"
brain_id="$session_id"

request_json "initial_graph" "200" "GET" "/brain/session/$session_id/graph"
initial_graph_file="$response_file"

request_json "moves_before_gets" "200" "GET" "/brain/session/$session_id/moves"
moves_before_gets_file="$response_file"
request_json "state_initial" "200" "GET" "/api/sessions/$session_id/autopilot/state"
json_check "state" "$response_file"
request_json "graph_get_guard" "200" "GET" "/brain/session/$session_id/graph"
request_json "moves_after_gets" "200" "GET" "/brain/session/$session_id/moves"
json_check "moves-same" "$moves_before_gets_file" "$response_file"

request_json "tick_1" "201" "POST" "/api/sessions/$session_id/autopilot/tick" '{"limit":5}'
tick_1_file="$response_file"
json_check "tick" "$tick_1_file"
candidate_id="$(json_value "$tick_1_file" "data.selectedCandidate.candidateId")"
target_claim_id="$(json_value "$tick_1_file" "data.selectedCandidate.targetClaimId")"

request_json "tick_2" "201" "POST" "/api/sessions/$session_id/autopilot/tick" '{"limit":5}'
tick_2_file="$response_file"
json_check "tick" "$tick_2_file"
request_json "state_after_ticks" "200" "GET" "/api/sessions/$session_id/autopilot/state"
json_check "no-duplicate-candidates" "$tick_1_file" "$tick_2_file" "$response_file"

request_json "start_focus" "201" "POST" "/api/sessions/$session_id/next-move-candidates/$candidate_id/start" '{}'
json_check "start" "$response_file"
suggestion_move_id="$(json_value "$response_file" "data.move.id")"

manual_claim_id="$(node "$checker" manual-claim-id "$seed_file" "$target_claim_id")"
request_json "manual_focus" "201" "POST" "/api/sessions/$session_id/focus/manual" "{\"claimId\":\"$manual_claim_id\",\"reason\":\"Smoke test manual override.\",\"previousSuggestionMoveId\":\"$suggestion_move_id\"}"
json_check "manual" "$response_file"

request_json "issue_defend" "201" "POST" "/api/sessions/$session_id/next-move-candidates/$candidate_id/challenge" '{}'
issue_defend_file="$response_file"
json_check "issue" "$issue_defend_file"
request_json "graph_before_defend" "200" "GET" "/brain/session/$session_id/graph"
json_check "claims-unchanged" "$initial_graph_file" "$response_file"
defend_challenge_id="$(json_value "$issue_defend_file" "data.challengeRound.id")"
request_json "defend" "200" "POST" "/api/challenges/$defend_challenge_id/respond" '{"response":"defend","reasoning":"The critique is useful, but the smoke test is exercising Defend without changing claim text."}'
json_check "respond" "$response_file" "defend"
request_json "graph_after_defend" "200" "GET" "/brain/session/$session_id/graph"
json_check "claims-unchanged" "$initial_graph_file" "$response_file"

request_json "issue_revise" "201" "POST" "/api/sessions/$session_id/next-move-candidates/$candidate_id/challenge" '{}'
issue_revise_file="$response_file"
json_check "issue" "$issue_revise_file"
revise_challenge_id="$(json_value "$issue_revise_file" "data.challengeRound.id")"
revised_text="Pre-seed founders will pay for Penny only during an urgent fundraising or strategy decision."
request_json "revise" "200" "POST" "/api/challenges/$revise_challenge_id/respond" "{\"response\":\"revise\",\"revisedText\":\"$revised_text\",\"reasoning\":\"Narrow the paid moment instead of claiming broad pre-traction willingness to pay.\"}"
json_check "respond" "$response_file" "revise"
request_json "graph_after_revise" "200" "GET" "/brain/session/$session_id/graph"
json_check "claims-after-revise" "$initial_graph_file" "$response_file" "$target_claim_id" "$revised_text"

request_json "issue_absorb" "201" "POST" "/api/sessions/$session_id/next-move-candidates/$candidate_id/challenge" '{}'
issue_absorb_file="$response_file"
json_check "issue" "$issue_absorb_file"
absorb_challenge_id="$(json_value "$issue_absorb_file" "data.challengeRound.id")"
request_json "absorb" "200" "POST" "/api/challenges/$absorb_challenge_id/respond" '{"response":"absorb","reasoning":"Keep this as an unresolved market risk for the brief."}'
json_check "respond" "$response_file" "absorb"
request_json "graph_after_absorb" "200" "GET" "/brain/session/$session_id/graph"
json_check "claims-after-revise" "$initial_graph_file" "$response_file" "$target_claim_id" "$revised_text"

request_json "brief" "201" "POST" "/api/sessions/$session_id/challenge-brief" '{}'
json_check "brief" "$response_file"

echo "Thinking Mode smoke passed for session $session_id"
