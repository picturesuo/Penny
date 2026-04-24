<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Purpose

This file is the repo-local operating manual for Codex in `penny`.

Read it at the start of each session.
Follow it unless the user explicitly overrides it.
Keep it current.

## Shared Context

- If `/Users/bensuo/.codex/penny-shared-context.md` exists, read it after this file and use it as the durable task artifact for the current task.
- Use `docs/queue.md` and `docs/knowledge.md` as the first local context after the shared artifact when they exist.
- Check the `Now` item in `docs/queue.md` before broadening scope.
- Update only the sections or artifact IDs owned by your current role.
- Do not rewrite the whole shared context file.
- Keep durable reusable knowledge in `docs/knowledge.md`; keep current-task state in the shared context file.

## Working Rules

- Keep scope tight.
- Prefer small, reversible changes.
- Classify the task as `tiny`, `medium`, or `broad` before editing.
- Tiny tasks may go straight to implementation.
- Broad tasks must first produce a file list and rollback plan.
- State assumptions explicitly when needed.
- Reproduce failures before editing when practical.
- Do not broaden scope beyond the failing path without a blocker.
- Do not rely on speculation when direct evidence is available.
- Do not treat a non-reproduced issue as confirmed.
- Do not auto-publish partial, failing, or unverified work.
- When verification is blocked by missing environment or unrelated failures, record the exact blocker.
- When the work moves from one file to another, commit and push the finished file before starting the next file.
- If changing more than one file in a dirty worktree, use path-limited commits such as `git commit --only <path>` so unrelated staged or untracked files are not swept into the commit.

## Commit Routing

- Commit repo-visible changes directly on `main` by default.
- Push every commit to `origin/main` immediately after the commit is created.
- Do not leave completed work only on a `codex/*` branch unless the user explicitly asks for branch or pull-request workflow.
- Before committing, verify the current branch is `main` or use `git push origin HEAD:main` so the commit lands on the real GitHub `main` branch.
- When more than one file changes, commit and push each finished file separately before editing the next file.
- Prefer many minimal commits over one large commit; each commit should cover one file or one tightly scoped file change.
- Do not ask for permission before committing and pushing repo-visible changes to `main`.
- If verification is blocked or fails for reasons outside the changed file, still commit and push the file change to `main`, then state the verification status clearly.
- Auto-push coherent repo-visible changes by default with `git push origin HEAD:main`.
- Use local-only commits only when the user explicitly requests local-only work.

## Verification

- Run the narrowest useful verification for the file or behavior changed.
- For docs-only changes, run `git diff --check -- <path>`.
- For code changes, prefer targeted tests first, then broaden only when the change affects shared behavior.
- Record any blocked verification with the exact blocker.
