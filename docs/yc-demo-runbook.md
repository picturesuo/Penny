# YC Demo Runbook

## Setup
- Start the local app with in-memory services when the remote database is not available:
  `DATABASE_URL= PENNY_SKIP_DATABASE_PREP=true PENNY_AUTH_MODE=dev PORT=3007 pnpm dev`
- Open `http://localhost:3007`.
- Use the fixture path only. Do not demo live Gmail OAuth, Slack, Drive, Calendar, or broad import setup.
- One-path browser smoke:
  `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --reporter=line`
- Headed proof capture:
  `PENNY_BASE_URL=http://localhost:3007 PENNY_PLAYWRIGHT_SLOWMO_MS=150 PENNY_PLAYWRIGHT_VIDEO=on PENNY_PLAYWRIGHT_TRACE=on PENNY_PLAYWRIGHT_SCREENSHOT=on PENNY_PROOF_DIR=docs/proof/yc-recording/screenshots pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --headed --reporter=line --output=docs/proof/yc-recording/playwright-headed`
- Repeat proof:
  `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --repeat-each=100 --reporter=line --output=docs/proof/yc-recording/playwright-headless-100`
- Larger local stability proof:
  `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --repeat-each=500 --reporter=line --output=docs/proof/yc-recording/playwright-headless-500`

## Exact Click Path
1. On the landing page, click `Build with Penny`.
2. Wait for Create to open and show `Using your Brain`.
3. Confirm the rough idea mentions emails, messages, founder notes, vague ideas, buildable specs, and coding agents.
4. Confirm fixture labels are visible: `Email fixture`, `Gmail-style context`, `Manual messages context`, `Founder notes`, `trainingUse=false`.
5. Confirm five Create cards are visible: `Personal`, `Practical`, `Valuable`, `Critical`, `Weird`.
6. Confirm the Canvas reads: Penny -> Brain sources -> Create options -> Learn explanation -> Export prompt.
7. Open `Details` on `Personal` and point at memory/source evidence.
8. Select `Personal`, `Valuable`, and `Critical`.
9. In `Comment`, type: `Keep this founder/builder path: memory-native workbench, human judgment, and buildable specs before coding agents.`
10. Click `Update artifact`.
11. Point at the artifact v2 outline and verification panel. The outline should show Product thesis, Target user, Problem, Why now, Core loop, Memory layer, Create mode, Learn bridge, Data sources, Moat, Risks, MVP scope, Demo script, and Build prompt/export.
12. Click `Learn this`.
13. In Learn, show `Explain simply`, `Show worked example`, and `Show how this applies to my artifact`.
14. Click `Back to Create`.
15. Confirm the selected cards, comment, artifact, evidence, and Canvas are preserved.
16. Click `Export prompt`.
17. Show the exported prompt includes `## YC Demo Spec`, selected option history, source/memory evidence, and repeated rejected directions.

## 3-Minute Script
**0:00-0:25 - Context**
Penny starts from my own context, not a blank chatbot. I click `Build with Penny`, which loads a private YC founder fixture: email-style notes, message-style notes, and founder notes. The data is fixture/manual only for this recording and is marked `trainingUse=false`.

**0:25-1:05 - Create**
The rough idea is already shaped around what I have been circling: Penny as an ideation and thinking workbench that turns vague ideas into buildable specs before coding agents start. Create gives five directions instead of one answer: Personal, Practical, Valuable, Critical, and Weird. I open Personal details to show why a card exists and what memory/source evidence it used.

**1:05-1:45 - Judgment**
I select Personal, Valuable, and Critical, then add the founder/builder comment. Penny records that judgment and updates the artifact. The point is not that Penny chooses a best answer for me. I choose the mix, and Penny turns that judgment into a clearer product artifact.

**1:45-2:20 - Learn**
I click Learn this on the Brain Ranker concept. Learn explains why explicit judgment events, like selections and comments, should matter more than passive behavior. Then I go Back to Create and the selected cards, comment, and artifact are still there.

**2:20-3:00 - Export**
I export the prompt. The artifact now carries the rough idea, YC demo spec, selected option history, source/memory evidence, rejected directions, constraints, and implementation requirements. The export is what I would hand to Codex or another coding agent.

Close with: “Penny is not a chatbot. It is a memory-native creativity workbench.”

## Recovery Notes
- If Create opens context-light, return to landing and click `Build with Penny` again.
- If the local server tries to prepare a remote database, restart with `DATABASE_URL= PENNY_SKIP_DATABASE_PREP=true`.
- If a model provider is not configured, deterministic Create is expected; the provider panel should say deterministic or fallback rather than inventing model-backed output.
- Proof assets from the last audit run live under `docs/proof/yc-recording/`.
