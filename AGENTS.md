<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commit Routing

- Commit repo-visible changes directly on `main` by default.
- Push every commit to `origin/main` immediately after the commit is created.
- Do not leave completed work only on a `codex/*` branch unless the user explicitly asks for branch or pull-request workflow.
- Before committing, verify the current branch is `main` or use `git push origin HEAD:main` so the commit lands on the real GitHub `main` branch.
- When more than one file changes, commit and push each finished file separately before editing the next file.
- Prefer many minimal commits over one large commit; each commit should cover one file or one tightly scoped file change.
- Do not ask for permission before committing and pushing repo-visible changes to `main`.
- If verification is blocked or fails for reasons outside the changed file, still commit and push the file change to `main`, then state the verification status clearly.
- Use local-only commits only when the user explicitly requests local-only work.
