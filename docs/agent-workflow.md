# Agent Workflow

This file is the shared workflow source for Codex and Claude sessions in "penny".

## Shared Context
- If a shared context file exists, use it as the durable task artifact for the current task.
- Update only the sections or artifact IDs owned by your role.
- Do not rewrite the whole shared context file.
- Keep durable reusable knowledge in `docs/knowledge.md`; keep current-task state in the shared context file.

## Context Reset
- Treat 80% context used as the reset point.
- Before compacting, write current status, decisions, changed files, verification, and next action to the shared context file.
- Prefer the agent-native reset: Codex should compact or start a fresh launched pane; Claude should use `/compact`.
- Do not continue deep into the final 20% of context unless the user explicitly asks you to finish a tiny active command first.

## Publish Policy
- If publish mode is `auto`, auto-commit and auto-push coherent repo-visible changes with `bash /Users/bensuo/ghostty-codex-launchpad/scripts/codex-commit.sh <paths...>`.
- When work moves from one file to another, finish, verify, commit, and push the current file before starting the next file.
- Use `bash /Users/bensuo/ghostty-codex-launchpad/scripts/codex-commit.sh --each-path <paths...>` when several finished files are ready.
- Use `--no-push` only when a local-only commit is intentional.
- Do not publish private, personal, scratch, partial, failing, or unverified work.

## Work Rules
- Keep scope tight and reversible.
- State assumptions when they affect implementation.
- Read local instructions and nearby code before editing.
- Verify with the most direct local command that fits the change.
