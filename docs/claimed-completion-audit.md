# Claimed Completion Audit

Date: May 23, 2026

## Audit Commands
- `git status --short --branch`: clean on `main...origin/main`.
- `git log -1 --stat --decorate`: HEAD is `e490f7f Update YC stability duration`, which only changes `docs/yc-stability-report.md`.
- `git diff HEAD~1..HEAD --stat`: one-line stability duration edit only.

## Changed Files Inspected
- `docs/yc-stability-report.md`
- `docs/yc-demo-runbook.md`
- `test/e2e/yc-recording.spec.cjs`
- `test/fixtures/penny-yc-founder-fixture.json`
- `packages/brain/src/brain-memory-route.ts`
- `packages/brain/frontend/src/App.tsx`
- `packages/brain/frontend/src/api/brainClient.ts`
- `packages/brain/frontend/src/components/LandingPage.tsx`
- `packages/brain/frontend/src/components/CreateWorkspace.tsx`
- `packages/brain/frontend/src/components/LearnWorkspace.tsx`
- `packages/brain/src/create-route.ts`

## Real Work Found
- Public landing has a visible `Build with Penny` CTA wired through `LandingPage` and `App`.
- The CTA requests `/api/brain/demo-fixture/yc-founder`, imports the fixture through the normal Brain import route, opens Create, and preloads the YC Create prompt.
- The YC fixture exists and includes Lovable hackathon, vague ideas -> buildable specs, before coding agents, memory-native workbench, human judgment, not GPT wrapper, and rejected notes app/dashboard/chatbot/assistant directions.
- Create renders the rough idea, five option cards, multi-select, comment, evidence drawer, artifact, Learn bridge, and export panel.
- Learn bridge exists with `Brain Ranker weights explicit judgment events over implicit behavior`, `Learn this`, and `Back to Create`.
- Existing e2e starts from the public landing page and clicks the visible CTA.

## Shallow Work And Shortcuts
- The last claimed-completion commit only edited a reported duration; it does not itself prove the product path.
- `docs/yc-stability-report.md` asserts prior command results without durable logs, videos, traces, or per-step proof assets.
- `test/e2e/yc-recording.spec.cjs` uses invisible request-scope injection for repeat isolation. That is useful test infrastructure, but it is not the same as human proof.
- The e2e over-relies on selectors and count checks. It does not assert all five visible card labels, the YC rough idea text, fixture/source labels, or concrete artifact section names.
- The e2e only checks the export for `## Personal Context Used`; it does not verify selected history, source/memory evidence, rejected directions, or coding-agent spec content.
- The existing Canvas assertion targets the Create sidebar region named `Create graph`, not a human-readable Canvas showing Penny -> Brain sources -> Create options -> Learn explanation -> Export prompt.
- The artifact currently uses generic implementation sections such as `Product goal`, `UX requirements`, and `Backend requirements`; it does not visibly include the requested YC demo sections: Product thesis, Problem, Why now, Memory layer, Create mode, Learn bridge, Data sources, Moat, Risks, MVP scope, Demo script, and Build prompt/export.
- Fixture privacy is present as text (`trainingUse=false`) rather than a structured fixture field. The imported Brain profile may still show `trainingUse=false`, but the fixture file itself is not structured around that label.
- Current proof assets include only one screenshot contact sheet. No trace, video, or fresh headed/manual proof assets have been generated in this audit run.

## Flagged E2E Gaps
- Missing visible text assertions for all five card labels.
- Missing fixture/source label assertions: Email fixture, Gmail-style context, Manual messages context, Founder notes, trainingUse=false.
- Missing assertion that Personal evidence drawer contains actual memory/source labels and rationale from the fixture.
- Missing artifact assertions for the requested YC demo artifact sections.
- Missing assertion that the artifact still exists after `Back to Create`.
- Missing export assertions for selected option history, source/memory evidence, repeated rejected directions, and build prompt/spec sections.
- Missing true Canvas proof beyond the compact Create graph.
- Missing headed video/trace/screenshot output in the permanent command.

## Initial Verdict
FAIL.

The app has a credible visible skeleton for the YC path, but the completion claim is not proven and the artifact/Canvas/proof coverage is too shallow for the stated objective.

## Repairs Applied In This Audit
- Added a visible `YC demo Canvas` in Create: Penny -> Brain sources -> Create options -> Learn explanation -> Export prompt.
- Added visible YC fixture labels in Create: Email fixture, Gmail-style context, Manual messages context, Founder notes, trainingUse=false.
- Added a visible YC artifact outline with Product thesis, Target user, Problem, Why now, Core loop, Memory layer, Create mode, Learn bridge, Data sources, Moat, Risks, MVP scope, Demo script, and Build prompt/export.
- Updated the coding-prompt export to include `## YC Demo Spec` and the required YC section headings.
- Tightened the e2e to assert visible fixture labels, all five card labels, Canvas text, evidence drawer content, artifact headings, Learn bridge state, Back-to-Create preservation, and export sections.
- Added durable proof capture support to the e2e through `PENNY_PROOF_DIR`, video, screenshots, and trace options.
- Kept the fixture path visible from the public landing page; no direct Create/Learn/Canvas entrypoint was used for proof.

## Proof Generated
- Named screenshots: `docs/proof/yc-recording/screenshots/000-01-landing.png` through `000-08-export.png`.
- Headed single-pass video/trace/screenshot: `docs/proof/yc-recording/playwright-headed/`.
- Headed 10-repeat video/trace/screenshot set: `docs/proof/yc-recording/playwright-headed-10/`.
- Headless 100-repeat result: `docs/proof/yc-recording/playwright-headless-100/.last-run.json`.
- Headless 500-repeat result: `docs/proof/yc-recording/playwright-headless-500/.last-run.json`.
- Manual click-through note: `docs/proof/yc-recording/manual/manual-click-through.md`.

## Verification Run In This Audit
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 641 tests.
- `pnpm build`: passed.
- One e2e from landing: `1 passed (2.6s)`.
- Headed proof run with slowMo, video, screenshots, and trace: `1 passed (6.4s)`.
- Headed recorded repeats: `10 passed (32.7s)`.
- Headless repeats: `100 passed (1.2m)`.
- Larger headless repeat run: `500 passed (7.4m)`.
- Manual isolated-Chrome click-through reached `Coding-agent prompt exported` with Personal + Valuable + Critical, comment, artifact v2, Learn bridge, Back to Create state preservation, Canvas, and exported YC demo spec visible.

## Final Verdict
PASS.

The original completion claim was not trustworthy on its own. After this audit, the YC path is backed by visible UI repairs, stronger assertions, headed video/trace/screenshot proof, 10 headed repeats, 100 and 500 headless repeats, and a manual click-through from public landing to export.
