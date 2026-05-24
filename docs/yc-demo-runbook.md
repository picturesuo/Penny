# YC Demo Runbook

## Setup
- Start the local app with in-memory services when the remote database is not available:
  `DATABASE_URL= PENNY_SKIP_DATABASE_PREP=true PENNY_AUTH_MODE=dev PORT=3007 pnpm dev`
- Open `http://localhost:3007`.
- Fixture path: `test/fixtures/penny-yc-founder-fixture.json`.
- Primary entry point: click `Start Create` on the landing page. This loads the YC-safe fixture and preloads the demo prompt.
- Use the fixture/manual path only. Do not demo live Gmail, LinkedIn, WhatsApp, iMessage, SMS, Slack, Drive, Calendar, or new OAuth setup.
- The YC fixture is safe fake data with email-style context, manual messages transcript notes, founder notes, rejected directions, and `trainingUse=false`. Some labels are intentionally style labels, not live account claims.
- Product inspiration to preserve: Learn should feel like a graph that teaches, not a graph that impresses. The visible pattern is `source -> concept -> use -> check`, adapted from code-understanding tools such as Understand Anything but applied to any founder material.

## Exact Demo Prompt
`Start Create` preloads this prompt. Use it manually only if you are testing the composer fallback:

```text
I want to create a YC startup around ideation and thinking - maybe a thinking instrument. It should use my past emails, messages, and notes to help me turn vague ideas into buildable structure. I want it to feel like a workbench that gives ideas direction without taking judgment away from the human.
```

## Click Path
1. Landing page: click `Start Create`.
2. Wait for Create to open and show the preloaded YC founder prompt.
3. Confirm `Using your Brain`.
4. Confirm fixture labels: `Email fixture`, `LinkedIn-style context`, `Manual messages transcript`, `WhatsApp-style demo`, `Founder notes`, `trainingUse=false`.
5. Confirm five equal Create cards: `Personal`, `Practical`, `Valuable`, `Critical`, `Weird`.
6. Point at the Canvas outline: `Penny -> Brain -> Create -> Learn -> Export`.
7. Open `Details` on `Personal`; show memory/source evidence and the no-live-account copy.
8. Select `Personal`, `Valuable`, and `Critical`.
9. In `Comment`, type: `Make this founder/builder focused. Keep the memory-native creativity angle, but make the output concrete enough that I could build it with Codex.`
10. Click `Update Idea Spec`.
11. Show the artifact outline: Product thesis, Target user, Problem, Why now, Core loop, Memory layer, Create mode, Learn bridge, Data sources, Moat, Risks, MVP scope, Demo script, Build prompt/export.
12. Keep the artifact outline collapsed by default. Expand one section only if useful; `Use selected mix` and `Add comment` live inside the expanded section.
13. Click `Learn this`.
14. In Learn, show the compact meaning map plus `Explain simply`, `Show worked example`, and `Apply to my artifact`.
15. Click `Back to Create` and confirm selections, comment, artifact, evidence drawer, and Canvas are preserved.
16. Click `Export prompt`.
17. Show the exported prompt includes `## YC Demo Spec`, selected option history, source/memory evidence, repeated rejected directions, privacy constraints, implementation sequence, acceptance tests, do-not-break list, and definition of done.

## 3-Minute Talk Track
**0:00-0:25 - Landing and context**
Penny starts from a rough founder thought, not a blank chatbot. I click Start Create, and Penny loads a safe demo Brain from fixture sources: email-style notes, LinkedIn-style founder context, manual WhatsApp-style transcript notes, founder notes, and rejected directions. This is not live account access.

**0:25-1:05 - Create**
Create gives five equal directions instead of one answer: Personal, Practical, Valuable, Critical, and Weird. I open Details to show why a card exists and what private memory/source evidence grounded it.

**1:05-1:45 - Judgment and artifact**
I select Personal, Valuable, and Critical, then add my founder/builder comment. Penny does not pick the best idea for me. I choose the mix, and Penny turns that judgment into a structured artifact.

**1:45-2:20 - Learn bridge and Canvas**
If I am confused, I click Learn this. Learn shows the source-to-concept path, explains the concept, gives a worked example, and applies it back to my artifact. Back to Create preserves state. The Canvas outline shows the product loop: Penny -> Brain -> Create -> Learn -> Export.

**2:20-3:00 - Export**
I export the prompt. The final output is strong enough to paste into Codex or Claude Code: rough idea, selected history, evidence, non-goals, UX/backend/data/privacy requirements, implementation sequence, acceptance tests, and do-not-break list.

Close with: "Penny is not a chatbot. It is a memory-native creativity workbench for founder/builders."

## Fallbacks
- If `Start Create` is unavailable, paste the exact demo prompt into the landing composer, choose `Ctrl C` for Create, and click the send arrow.
- If Gmail is not live, do nothing special. The demo is designed for safe fixture/manual context and should not require OAuth.
- If Create opens context-light, return to landing and click `Start Create` again.
- If a model provider is not configured, deterministic Create is expected. The provider panel should say deterministic or fallback rather than inventing model-backed output.
- If the evidence drawer is still open after returning from Learn, treat that as a feature: it proves state was preserved.

## Hide Or Cut
- Do not open live Gmail/LinkedIn/WhatsApp/iMessage/SMS setup.
- Do not show dev provider comparison UI.
- Do not discuss Slack, social connectors, broad ingestion, or new modes.
- Do not pitch generic notes, dashboard, productivity, or chatbot positioning.
- Cut manual artifact section comments if the demo clock is tight.
- Do not expand every artifact section. The compact outline is the recording default.

## Verification Commands
- Unit/integration:
  `pnpm test`
- Typecheck:
  `pnpm typecheck`
- Build:
  `pnpm build`
- Browser smoke:
  `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --reporter=line`
- Headed proof capture:
  `PENNY_BASE_URL=http://localhost:3007 PENNY_PLAYWRIGHT_SLOWMO_MS=150 PENNY_PLAYWRIGHT_VIDEO=on PENNY_PLAYWRIGHT_TRACE=on PENNY_PLAYWRIGHT_SCREENSHOT=on PENNY_PROOF_DIR=docs/proof/yc-recording/screenshots pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --headed --reporter=line --output=docs/proof/yc-recording/playwright-headed`
