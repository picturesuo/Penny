# AGENTS.md

## Purpose
This file is the repo-local operating manual for Codex in "penny".

Read it at the start of each session.
Follow it unless the user explicitly overrides it.
Keep it current.

## Shared Context
- If a shared context file exists, use it as the durable task artifact for the current task.
- Update only the sections or artifact IDs owned by your role.
- Do not rewrite the whole shared context file.
- Keep durable reusable knowledge in ; keep current-task state in the shared context file.

## Working Rules
- Keep scope tight.
- Prefer small, reversible changes.
- State assumptions explicitly when needed.
- Auto-push coherent repo-visible changes by default.
- When the work moves from one file to another, automatically commit and push the finished file before starting the next one.
- Do not ask the user for permission before pushing a coherent repo-visible change set.
- Auto-push coherent repo-visible changes by default with .
- Use  when changing more than one file so each file gets its own short commit message and push before the next file starts.
- Use  only when a local-only commit is intentional.
- Do not auto-publish partial, failing, or unverified work.
