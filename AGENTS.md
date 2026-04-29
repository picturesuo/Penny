# AGENTS.md

## Purpose
This file is the repo-local operating manual for Codex in "penny".

Read it at the start of each session.
Follow it unless the user explicitly overrides it.
Keep it current.

## Penny Product Truth
- Penny is a controllable thinking instrument enhanced by AI, not a generic chatbot.
- The MVP loop is seed idea -> assumptions -> thought map -> exploration -> challenge -> Defend/Revise/Absorb -> Learn -> Idea Map + Challenge Brief.
- Core modes are Brain, Challenge / Verify, and Learn / Makes Cents over the same thinking graph.
- Claim is the stable identity; ClaimVersion stores content, confidence, status, validity, and current/old state.
- Heavily depended-on claims are foundations; age them with review or decay after time passes.
- Move is immutable and append-only; meaningful changes create Moves.
- Add session and weekly reflection Moves; sessions should end with result, learning, and self-knowledge.
- BrainRun tracks every AI operation.
- SourceSpan preserves provenance.
- Assumptions are claims connected by depends_on edges.
- Counterarguments are claims connected by contradicts/challenges edges.
- Learn concepts are claims of kind=concept connected by teaches edges.
- Edges must not connect claims across invalid sessions unless explicitly marked cross-session or cross-sphere.
- WikiPage is a compiled view, not source of truth.
- Backend returns graph slices; frontend does not invent graph edges.
- Use provider-safe AI schemas plus strict local validation.
- Current state is derived from claims, claim versions, edges, and moves.
- Search stays Penny-native until the MVP loop is undeniable: add lexical and graph search over Penny rows first.
- Keep Supermemory-like semantic memory/search post-MVP; add embeddings later, after lexical/graph search proves insufficient.
- Add a precedent corpus later, structured by failure type; Penny's moat is reusable precedents, not generic web search.
- Do not jump to broad document ingestion before the seed -> challenge/verify -> learn -> artifact loop works end to end.
- Do not build a generic chatbot sidebar or pre-MVP features before the first loop works end to end.

## Shared Context
- If a shared context file exists, use it as the durable task artifact for the current task.
- Update only the sections or artifact IDs owned by your role.
- Do not rewrite the whole shared context file.
- Keep durable reusable knowledge in ; keep current-task state in the shared context file.

## Working Rules
- Keep scope tight.
- Prefer small, reversible changes.
- State assumptions explicitly when needed.
- Commit repo-visible changes directly on `main` by default.
- Push every commit to `origin/main` immediately after the commit is created.
- Do not leave completed work only on a `codex/*` branch unless the user explicitly asks for branch or pull-request workflow.
- Before committing, verify the current branch is `main` or use `git push origin HEAD:main` so the commit lands on the real GitHub `main` branch.
- Automatically commit and push every repo-visible file change to the GitHub repo.
- Do not ask for permission before committing or pushing repo-visible changes.
- When changing more than one file, commit and push each finished file before starting the next file.
- Prefer many minimal commits over one large commit; each commit should cover one file or one tightly scoped file change.
- Use short, specific commit messages that name the file or behavior changed.
- Push immediately after each commit so GitHub always has the latest completed file change.
- If verification is not possible or fails for reasons outside the changed file, still commit and push the file change, then state the verification status clearly.
- Use local-only commits only when the user explicitly requests local-only work.
