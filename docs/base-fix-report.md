# Penny Base Fix Report

Date: 2026-05-23

## Baseline

- `pnpm install`: skipped because `node_modules` and `pnpm-lock.yaml` are present and the lockfile was already usable.
- `pnpm test`: passed, 636 tests.
- `pnpm typecheck`: passed.
- `pnpm build`: passed. Vite built `packages/brain/public/index.html`, CSS, and JS assets.

## Failures

- No baseline command failures in this pass.
- No TypeScript blockers found.
- No production build blockers found.
- No failing unit or route tests found.

## Fixes In This Pass

- Added this report so the base status is explicit and future YC-demo work has a current reference point.

## Risky Routes And Surfaces

- `/dev/codebase` still exists behind `isCodebaseBrainPanelRoute()` in `packages/brain/frontend/src/App.tsx`. It is useful for internal agent context, but it is not a YC-recording surface.
- Google and Gmail connector surfaces exist in the Brain memory panel. They should stay out of the fixture path unless the demo is explicitly about connector readiness.
- Create provider comparison is guarded by `isCreateComparisonDevMode()` and should remain hidden in production-style recordings.
- Landing still accepts broad "Ask anything..." input. The YC path needs a specific fixture/Create CTA so the recording does not look like a generic chatbot.
- Canvas node actions include Learn, Create, Verify, Save, and Related. For the YC path, the intended route should be visible and the rest should not distract from Brain -> Create -> Learn -> Export.
- Live auth and rate-limit posture is dev-shaped. Public or investor-shared deployment needs strict token/session auth, rate limiting, and production-safe env validation enabled.

## Hidden Surfaces For YC Path

Keep the recorded path on:

- Brain
- Create
- Challenge / Verify inside Brain
- Learn inside Brain/Create context
- Canvas / Export

Keep out of the recorded path:

- Live Gmail OAuth
- Real iMessage/SMS
- Slack
- Drive / Calendar
- Broad document ingestion
- Codebase Brain dev panel
- Provider comparison/dev panels
- Fake connectors or setup flows
- Generic chatbot-style sidebars

## Cuts

- Use fixture/manual context only.
- Do not demo live OAuth, real inbox sync, Slack, Drive, Calendar, or broad file ingestion.
- Do not expand Learn beyond the single technical option needed for the Create -> Learn -> Create loop.
- Do not redesign the whole frontend; keep the Penny mark/vibe and limit visual work to newspaper hierarchy, warm paper, restrained borders, and spacing.
- Do not pitch semantic memory or embeddings before lexical/graph memory proves the MVP loop.

## Resolved Demo Gaps

- `test/fixtures/penny-yc-founder-fixture.json` is present and imports safe email-style, messages-style, LinkedIn-style, founder-note, and rejected-direction context.
- `docs/yc-demo-runbook.md`, `docs/yc-demo-script.md`, and `docs/yc-stability-report.md` are present.
- Browser e2e coverage exists for the YC fixture path, Brain-first path, and Learn source-to-concept tour.
- Landing shows `Start Create` and loads the YC founder fixture into Create.
- Create shows the required YC artifact sections in the fixture-backed path.
- Learn exposes the Brain Ranker technical option from Create with a return path back to Create.

Remaining non-demo work: production auth/rate limiting/Postgres, real connector proof, backend-derived non-demo Canvas, and deciding whether quick notes become Brain profile memories.
