# Alpha Demo Golden Path

Use this path for a local real-user Brain -> Create demo.

## Setup
- Run the app in dev mode so the demo fixture and Create comparison panel are visible.
- Keep model-backed Create opt-in:
  - `PENNY_CREATE_MODEL_BACKED=false` for deterministic/fallback comparison.
  - `PENNY_CREATE_MODEL_BACKED=true` plus `XAI_API_KEY` to compare live model-backed output.

## Walkthrough
1. Open Brain.
2. In Second Brain memory, import one source:
   - Use `Load Penny demo fixture` for the canned path, or
   - Upload a ChatGPT export ZIP, `conversations.json`, Claude JSON/CSV/text, markdown, CSV, or plain text notes.
3. Confirm the Brain profile:
   - Check uploaded source count.
   - Check `Penny understood` sections.
   - Mark at least one memory correct, boost, wrong, or forget if needed.
4. Click `Use this Brain to create something`.
5. In Create:
   - Enter or keep the rough idea.
   - Generate five directions.
   - Inspect provider status and memory/source counts.
   - In dev mode, run `Compare providers`.
6. Select useful cards, add a short judgment comment, and update the artifact.
7. Export the coding-agent prompt.

## Pass Criteria
- Import guidance is clear for supported and unsupported files.
- Brain profile shows private source-backed memory with `trainingUse=false`.
- Create cards cite real memory/source evidence and do not invent Gmail, Slack, OAuth, messages, hidden memory, or global-training claims.
- Dev comparison shows deterministic and model-backed/fallback outputs, verification scores, schema status, fallback reason, memory/source counts, and prompt quality signals.
- Exported prompt includes rough idea, selected option history, personal context, source/memory evidence, product goal, non-goals, UX/frontend/backend/data/privacy/verification requirements, implementation sequence, acceptance tests, do-not-break list, and definition of done.
