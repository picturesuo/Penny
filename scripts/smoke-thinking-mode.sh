#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://localhost:3000}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

status_for() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local output="$tmp_dir/$(echo "$method-$path" | tr '/:' '__').json"

  if [[ -n "$body" ]]; then
    curl -sS -o "$output" -w "%{http_code}" \
      -X "$method" \
      -H "content-type: application/json" \
      -d "$body" \
      "$base_url$path"
    return
  fi

  curl -sS -o "$output" -w "%{http_code}" \
    -X "$method" \
    "$base_url$path"
}

expect_status() {
  local expected="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local actual

  actual="$(status_for "$method" "$path" "$body")"

  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $method $path to return $expected, got $actual." >&2
    echo "Start the local API with: pnpm dev:api" >&2
    exit 1
  fi

  echo "ok $method $path -> $actual"
}

echo "Smoke testing Thinking Mode at $base_url"

expect_status "200" "GET" "/"
expect_status "405" "GET" "/brain/seed"
expect_status "405" "GET" "/autopilot/tick"
expect_status "400" "POST" "/autopilot/tick" '{"sessionId":"not-a-uuid"}'

cat <<'NOTE'

Non-mutating smoke checks passed.

Full happy-path smoke is intentionally left for the next wave because it needs:
- DATABASE_URL exported into the API process.
- `pnpm db:migrate` applied to the demo database.
- A mutating seed -> autopilot tick -> focus/manual override -> challenge response -> artifact flow.
NOTE
