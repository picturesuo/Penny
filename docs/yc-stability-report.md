# YC Demo Stability Report

Date: May 23, 2026

## Scope
This report covers the local YC recording path:

`Build with Penny` -> YC founder fixture import -> Create five cards -> inspect Personal evidence -> select Personal, Valuable, and Critical -> update artifact -> Learn this -> Back to Create -> Export prompt.

Visual evidence is captured in [yc-demo-recording-path.png](assets/yc-demo-recording-path.png), covering Landing, Create, Canvas, Learn, and Export.

## Environment
- Branch: `main`
- Local URL: `http://localhost:3007`
- Server command: `DATABASE_URL= PENNY_SKIP_DATABASE_PREP=true PENNY_AUTH_MODE=dev PORT=3007 pnpm dev`
- Browser verification: Playwright Chrome fallback. The in-app Browser plugin was checked, but no `iab` browser was available in this session.

## Verification
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 641 tests.
- `pnpm build`: passed.
- `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --reporter=line --output=.tmp-playwright-results`: passed, 1 test.
- `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --repeat-each=50 --reporter=line --output=.tmp-playwright-results`: passed, 50 tests in 35.2s.

## Stability Fix
The first parallel repeat run exposed a real test-shape problem: every repeat shared the same dev-auth identity, so the shared in-memory dev server eventually returned `Too many Penny API requests. Try again shortly.` The e2e spec now clears browser-local app state and injects unique dev scope headers for each repeat before the app boots.

This keeps the stress test aligned with Penny's scoped backend model without disabling rate limiting.
