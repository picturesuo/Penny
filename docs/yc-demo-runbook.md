# YC Demo Runbook

## Setup
- Start the local app with in-memory services when the remote database is not available:
  `DATABASE_URL= PENNY_SKIP_DATABASE_PREP=true PENNY_AUTH_MODE=dev PORT=3007 pnpm dev`
- Open `http://localhost:3007`.
- Fixture path: `test/fixtures/penny-yc-founder-fixture.json`.
- Use the fixture/manual path only. Do not demo live Gmail, LinkedIn, WhatsApp, iMessage, SMS, Slack, Drive, Calendar, or new OAuth setup.
- The YC fixture is safe fake data with email-style context, LinkedIn-style founder context, manual WhatsApp-style transcript notes, founder notes, rejected directions, and `trainingUse=false`.

## Exact Demo Prompt
Paste or type this into the landing composer:

```text
I want to create a YC startup around ideation and thinking - maybe a thinking instrument. It should use my past emails, messages, and notes to help me turn vague ideas into buildable structure. I want it to feel like a workbench that gives ideas direction without taking judgment away from the human.
```

## Click Path
1. Landing page: enter the exact demo prompt.
2. Choose `Ctrl C for Create`.
3. Click the send arrow.
4. Wait for Create to open and show `Using your Brain`.
5. Confirm fixture labels: `Email fixture`, `LinkedIn-style context`, `Manual messages transcript`, `WhatsApp-style demo`, `Founder notes`, `trainingUse=false`.
6. Confirm five equal Create cards: `Personal`, `Practical`, `Valuable`, `Critical`, `Weird`.
7. Point at the Canvas outline: `Penny -> Brain -> Create -> Learn -> Export`.
8. Open `Details` on `Personal`; show memory/source evidence and the no-live-account copy.
9. Select `Personal`, `Valuable`, and `Critical`.
10. In `Comment`, type: `Keep this founder/builder path: memory-native workbench, human judgment, and buildable specs before coding agents.`
11. Click `Update artifact`.
12. Show the artifact outline: Product thesis, Target user, Problem, Why now, Core loop, Brain, Create, Learn bridge, Data sources, Moat, Risks, MVP scope, Demo script, Build prompt/export.
13. Use section actions if useful: `Expand`, `Use selected mix`, `Add comment`.
14. Click `Learn this`.
15. In Learn, show `Explain simply`, `Show worked example`, and `Apply to my artifact`.
16. Click `Back to Create` and confirm selections, comment, artifact, evidence drawer, and Canvas are preserved.
17. Click `Export prompt`.
18. Show the exported prompt includes `## YC Demo Spec`, selected option history, source/memory evidence, repeated rejected directions, privacy constraints, implementation sequence, acceptance tests, do-not-break list, and definition of done.

## 3-Minute Talk Track
**0:00-0:25 - Landing and context**
Penny starts from a rough founder thought, not a blank chatbot. I type the YC idea, choose Create, and Penny synthesizes a safe demo Brain from fixture sources: email-style notes, LinkedIn-style founder context, manual WhatsApp-style transcript notes, founder notes, and rejected directions. This is not live account access.

**0:25-1:05 - Create**
Create gives five equal directions instead of one answer: Personal, Practical, Valuable, Critical, and Weird. I open Details to show why a card exists and what private memory/source evidence grounded it.

**1:05-1:45 - Judgment and artifact**
I select Personal, Valuable, and Critical, then add my founder/builder comment. Penny does not pick the best idea for me. I choose the mix, and Penny turns that judgment into a structured artifact.

**1:45-2:20 - Learn bridge and Canvas**
If I am confused, I click Learn this. Learn explains the concept, shows a worked example, and applies it back to my artifact. Back to Create preserves state. The Canvas outline shows the product loop: Penny -> Brain -> Create -> Learn -> Export.

**2:20-3:00 - Export**
I export the prompt. The final output is strong enough to paste into Codex or Claude Code: rough idea, selected history, evidence, non-goals, UX/backend/data/privacy requirements, implementation sequence, acceptance tests, and do-not-break list.

Close with: "Penny is not a chatbot. It is a memory-native creativity workbench for founder/builders."

## Fallbacks
- If Gmail is not live, do nothing special. The demo is designed for safe fixture/manual context and should not require OAuth.
- If Create opens context-light, return to landing, paste the exact demo prompt, choose Create, and send again.
- If a model provider is not configured, deterministic Create is expected. The provider panel should say deterministic or fallback rather than inventing model-backed output.
- If the evidence drawer is still open after returning from Learn, treat that as a feature: it proves state was preserved.

## Hide Or Cut
- Do not open live Gmail/LinkedIn/WhatsApp/iMessage/SMS setup.
- Do not show dev provider comparison UI.
- Do not discuss Slack, social connectors, broad ingestion, or new modes.
- Do not pitch generic notes, dashboard, productivity, or chatbot positioning.
- Cut manual artifact section comments if the demo clock is tight.

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
