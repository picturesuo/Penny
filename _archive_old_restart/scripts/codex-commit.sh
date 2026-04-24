#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/codex-commit.sh [--no-push] [--each-path] <message> <path> [<path>...]

Stages only the provided paths, creates a commit with the given message, and
pushes to the current branch on origin unless --no-push is set.
EOF
}

no_push=false
each_path=false

if [[ $# -gt 0 && "$1" == "--no-push" ]]; then
  no_push=true
  shift
fi

if [[ $# -gt 0 && "$1" == "--each-path" ]]; then
  each_path=true
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

commit_path() {
  local message="$1"
  local path="$2"
  local commit_message="$message"

  if [[ "$each_path" == true ]]; then
    local short_path="${path%/}"
    commit_message="${message}: ${short_path}"
  fi

  git add -- "$path"

  if git diff --cached --quiet --exit-code; then
    echo "No staged changes for: $path"
    return 0
  fi

  git commit -m "$commit_message"

  if [[ "$no_push" == false ]]; then
    branch="$(git branch --show-current)"
    git push origin "$branch"
  fi
}

if [[ "$each_path" == true ]]; then
  for path in "${paths[@]}"; do
    commit_path "$message" "$path"
  done
else
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
fi
