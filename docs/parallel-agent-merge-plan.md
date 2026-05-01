# Parallel Agent Merge Plan

Status: Sprint P1 rolling integration
Owner: Terminal 4, Integration / Tests / Merge Captain
Last updated: 2026-05-01

## Baseline Commands

Run these from the repo root before Terminal 4 marks a lane mergeable:

- Install: `pnpm install --frozen-lockfile`
- Backend build: `pnpm build:backend`
- Full typecheck: `pnpm typecheck`
- Unit and contract tests: `pnpm test`
- Frontend build: `pnpm build:frontend`
- Backend start smoke, when PostgreSQL tools are available: `SMOKE_ISOLATED_DB=1 BASE_URL=http://localhost:3017 PORT=3017 pnpm smoke:thinking`

If `packages/brain/public/**` is dirty from another lane, use the equivalent temp-output frontend build for pre-merge verification:

```sh
pnpm exec vite build --config packages/brain/frontend/vite.config.ts --outDir /tmp/penny-p1-frontend-build --emptyOutDir true
```

## Active Branches And Worktrees

- Terminal 4 integration branch: `codex/terminal4-p1-integration`
- Terminal 4 worktree: `/Users/bensuo/Desktop/penny-terminal4-p1-integration`
- Terminal 1 known Wave 7 branch: `origin/codex/wave7-hybrid-retrieval`
- Terminal 1 known worktree: `/Users/bensuo/Desktop/penny-wave7-hybrid-retrieval`
- Terminals 2 and 3 must report their branch and worktree before merge review; Terminal 4 will not infer ownership from dirty files.

## Terminal 4 Ownership

Terminal 4 owns:

- Baseline command scripts and documentation.
- Cross-lane contract tests that use mocked payloads.
- Merge order and final conflict resolution guidance.
- Final verification on the merge candidate.

Terminal 4 does not own:

- Product UI implementation except smoke tests.
- Generated frontend assets until the final integration pass.
- Legacy route deletion.
- Document upload.
- Standalone top-level Search product work.

## Pre-Implementation Contract Tests

Current Terminal 4 contracts are intentionally narrow:

- Canvas contract: `P1CanvasPayload` is a Brain graph projection with backend-owned node and edge refs.
- Hybrid retrieval contract: `P1HybridRetrievalProvider` returns Brain-grounded matches plus a prompt-ready `contextSummary`.
- Navigation smoke: Learn, Brain, and Check remain the only top-level modes. Search is a capability inside Learn/Verify, not a nav destination.

Brain search endpoint status:

- No merged Brain search endpoint exists yet.
- Do not add a top-level search route for Sprint P1.
- When a Brain-scoped search endpoint lands, Terminal 4 should add a route test that proves it is scoped, read-only, and backed by Brain rows or the hybrid retrieval contract.

## Merge Order

Use this order once Terminals 1, 2, and 3 report ready:

1. Merge Terminal 4 baseline integration tests and docs first.
2. Merge Terminal 1 core data / retrieval contracts next, including `origin/codex/wave7-hybrid-retrieval` or its successor.
3. Merge Terminal 2 backend/API wiring after Terminal 1, especially Learn/Verify retrieval consumers and any Brain-scoped route contracts.
4. Merge Terminal 3 frontend UX after the backend contracts it consumes are present, especially Canvas, Learn, Check, and Brain rendering.
5. Run Terminal 4 final integration on the combined head, including the normal `pnpm build:frontend` that updates `packages/brain/public/**` exactly once.

## Conflict Rules

- Do not revert another terminal's work.
- Do not resolve conflicts by deleting legacy routes unless a task explicitly owns that deletion.
- Prefer adapting to the existing source-of-truth contract over introducing parallel state.
- If a dependency is not merged yet, keep a typed mock or boundary stub and document the expected contract in this file or the owning test.
- Generated frontend assets are last-write-wins only in the final Terminal 4 integration pass.
- Package scripts are Terminal 4 owned for this sprint; other terminals should not change baseline script names without coordinating.

## Required Lane Reports

Each terminal must report these before Terminal 4 merges:

- Branch name and worktree path.
- Files changed.
- API/type contracts added or changed.
- Tests run, with exact commands and pass/fail status.
- Known baseline failures.
- Whether generated assets were touched.
- Blockers or typed stubs that Terminal 4 must reconcile.
- Safe-to-merge judgment from that terminal.
