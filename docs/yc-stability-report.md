# YC Demo Stability Report

Date: May 24, 2026

## Scope
This report covers the local YC recording path:

`Start Create` -> YC founder fixture import -> Create five cards -> visible Canvas -> inspect Personal evidence -> select Personal, Valuable, and Critical -> update artifact -> Learn this -> Back to Create -> Export prompt.

Visual evidence is captured under `docs/proof/yc-recording/`, including named screenshots for Landing, fixture/Create/Canvas, evidence, selections/comment, artifact, Learn, return-state preservation, and Export.

## Environment
- Branch: `main`
- Local URL: `http://localhost:3007`
- Server command: `DATABASE_URL= PENNY_SKIP_DATABASE_PREP=true PENNY_AUTH_MODE=dev PORT=3007 pnpm dev`
- Browser verification: Playwright Chrome fallback. The in-app Browser plugin was checked, but no `iab` browser was available in this session.

## Verification
- `pnpm test`: passed, 658 tests.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `PENNY_BASE_URL=http://localhost:3039 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs test/e2e/brain-first.spec.cjs test/e2e/learn-understanding-tour.spec.cjs --reporter=line --output=.tmp-e2e-latest`: passed, 3 tests in 6.5s.
- `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --reporter=line --output=.tmp-playwright-results`: passed, 1 test in 2.6s.
- `PENNY_BASE_URL=http://localhost:3007 PENNY_PLAYWRIGHT_SLOWMO_MS=150 PENNY_PLAYWRIGHT_VIDEO=on PENNY_PLAYWRIGHT_TRACE=on PENNY_PLAYWRIGHT_SCREENSHOT=on PENNY_PROOF_DIR=docs/proof/yc-recording/screenshots pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --headed --reporter=line --output=docs/proof/yc-recording/playwright-headed`: passed, 1 headed test in 6.4s.
- `PENNY_BASE_URL=http://localhost:3007 PENNY_PLAYWRIGHT_SLOWMO_MS=75 PENNY_PLAYWRIGHT_VIDEO=on PENNY_PLAYWRIGHT_TRACE=on PENNY_PLAYWRIGHT_SCREENSHOT=on pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --repeat-each=10 --headed --workers=1 --reporter=line --output=docs/proof/yc-recording/playwright-headed-10`: passed, 10 headed tests in 32.7s.
- `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --repeat-each=100 --reporter=line --output=docs/proof/yc-recording/playwright-headless-100`: passed, 100 tests in 1.2m.
- `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --repeat-each=500 --reporter=line --output=docs/proof/yc-recording/playwright-headless-500`: passed, 500 tests in 7.4m.
- Manual isolated-Chrome click-through reached `Coding-agent prompt exported`; see `docs/proof/yc-recording/manual/manual-click-through.md`.

## Proof Assets
- `docs/proof/yc-recording/screenshots/000-01-landing.png`
- `docs/proof/yc-recording/screenshots/000-02-fixture-create-canvas.png`
- `docs/proof/yc-recording/screenshots/000-03-evidence.png`
- `docs/proof/yc-recording/screenshots/000-04-selections-comment.png`
- `docs/proof/yc-recording/screenshots/000-05-artifact.png`
- `docs/proof/yc-recording/screenshots/000-06-learn.png`
- `docs/proof/yc-recording/screenshots/000-07-return-state.png`
- `docs/proof/yc-recording/screenshots/000-08-export.png`
- `docs/proof/yc-recording/playwright-headed/` for headed video, trace, and final screenshot.
- `docs/proof/yc-recording/playwright-headed-10/` for headed repeat videos, traces, and final screenshots.
- `docs/proof/yc-recording/playwright-headless-100/.last-run.json`
- `docs/proof/yc-recording/playwright-headless-500/.last-run.json`

## Stability Fix
The first parallel repeat run exposed a real test-shape problem: every repeat shared the same dev-auth identity, so the shared in-memory dev server eventually returned `Too many Penny API requests. Try again shortly.` The e2e spec now clears browser-local app state and injects unique dev scope headers for each repeat before the app boots.

This keeps the stress test aligned with Penny's scoped backend model without disabling rate limiting. The current proof runs start from the public landing page and rely on visible fixture loading rather than direct Create/Learn entrypoints.

## Brain-First Refresh

The local dogfood path now has its own browser proof. `brain-first.spec.cjs` starts from landing, creates a quick note, saves it to Brain, creates a document, imports Brain context, starts Create from that Brain, opens Learn, exports a prompt, and reloads to prove Create state restores. Local demo mode uses scoped in-memory fallbacks when database prep is skipped; staging/production must still use a migrated Postgres database.
