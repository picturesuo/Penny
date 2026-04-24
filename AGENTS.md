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
- Automatically commit and push every repo-visible file change to the GitHub repo.
- Do not ask for permission before committing or pushing repo-visible changes.
- When changing more than one file, commit and push each finished file before starting the next file.
- Prefer many minimal commits over one large commit; each commit should cover one file or one tightly scoped file change.
- Use short, specific commit messages that name the file or behavior changed.
- Push immediately after each commit so GitHub always has the latest completed file change.
- If verification is not possible or fails for reasons outside the changed file, still commit and push the file change, then state the verification status clearly.
- Use local-only commits only when the user explicitly requests local-only work.
