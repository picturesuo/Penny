# YC MVP Demo

Status: Current Create-first MVP demo path
Canonical runbook: `docs/yc-demo-runbook.md`
Recording script: `docs/yc-demo-script.md`

## Goal

Show one reliable loop:

`safe Brain fixture -> Create options -> founder judgment -> Idea Spec -> Learn bridge -> Canvas -> export prompt`

The demo proves that Penny is a memory-native creativity workbench, not a chatbot, connector hub, or generic memory app.

## Demo Path

1. Open Penny.
2. Click `Start Create`.
3. Confirm the YC-safe Brain fixture is loaded.
4. Confirm the prompt mentions emails, messages, notes, judgment, and buildable structure.
5. Show five equal Create cards: `Personal`, `Practical`, `Valuable`, `Critical`, `Weird`.
6. Open one details drawer to show source-backed evidence.
7. Select `Personal`, `Valuable`, and `Critical`.
8. Add the founder/builder Codex comment from the runbook.
9. Click `Update Idea Spec`.
10. Show the compact artifact outline.
11. Click `Learn this`.
12. Show the source-to-concept meaning map and the three Learn choices.
13. Return to Create with state preserved.
14. Point to the Canvas outline.
15. Click `Export prompt`.

## What To Say

- Penny starts with rough founder context, then gives directions instead of one answer.
- The fixture is safe fake data: email-style context, manual messages, founder notes, rejected directions, and `trainingUse=false`.
- Create keeps human judgment central by showing five equal options.
- Learn is for application: source -> concept -> use -> check.
- Export turns the chosen structure into a coding-agent prompt.

## Required Proof Points

- `Start Create` opens the demo without setup hunting.
- Fixture labels are honest and do not imply live Gmail, iMessage, WhatsApp, Slack, Drive, Calendar, or OAuth.
- Create shows all five option cards.
- The artifact outline is compact by default.
- Learn opens from Create and returns without losing selected options, comment, artifact, or evidence drawer.
- Canvas shows `Penny -> Brain -> Create -> Learn -> Export`.
- Export includes selected option history, source/memory evidence, privacy constraints, acceptance tests, and a definition of done.

## Current Demo Risks

- Live connectors remain out of scope for the YC recording path.
- Provider-backed model output can vary; deterministic Create must remain stable for recording.
- The demo should not branch into old Challenge-mode scripts, broad ingestion, or dev-only provider comparison.
- If the artifact prose feels long, keep sections collapsed and show only one expanded section.
