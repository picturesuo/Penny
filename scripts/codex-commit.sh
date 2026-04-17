#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/codex-commit.sh [--no-push] <message> <path> [<path>...]

Stages only the provided paths, creates a commit with the given message, and
pushes to the current branch on origin unless --no-push is set.
EOF
}

no_push=false

if [[ $# -gt 0 && "$1" == "--no-push" ]]; then
  no_push=true
  shift
fi

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 1
fi

message="$1"
shift

paths=("$@")

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git add -- "${paths[@]}"

if git diff --cached --quiet --exit-code; then
  echo "No staged changes for: ${paths[*]}"
  exit 0
fi

git commit -m "$message"

if [[ "$no_push" == false ]]; then
  branch="$(git branch --show-current)"
  git push origin "$branch"
fi
