# YC Demo Script: Thinking Mode Autopilot

Status: Wave 1 backend contract  
Date: 2026-04-29

## Demo Goal

Show that Penny is a controllable AI thinking instrument for founders, not a chatbot. The demo should make backend-owned thinking state visible: claims, assumptions, dependency edges, ranked next moves, challenge response history, and a Challenge Brief artifact.

## Golden Seed

> I'm building Penny, a thinking autopilot for founders.

## Setup

- Start from a clean new session.
- Use the golden seed exactly.
- Use the YC demo graph fixture as the expected deterministic structure for tests and seeded demos.
- Keep the frontend in cockpit mode: graph, active focus, candidates, challenge, and artifact. Do not present this as a chat conversation.

## Demo Flow

### 1. Enter the raw idea

Action: paste the golden seed.

Backend evidence:

- `source_recorded`
- `seed_claim_created`
- `assumptions_extracted`

Narration:

- Penny does not answer the idea like a chatbot.
- Penny turns the idea into claims, assumptions, and dependencies that can be inspected and challenged.

### 2. Show the thought map

Expected visible structure:

- root claim: Penny is a thinking autopilot for founders
- assumptions about founder demand, controllability, willingness to use structured thinking, and usefulness versus generic AI tools
- one concept node: controllable AI thinking instrument
- dependency edges showing which claims rely on which assumptions

Narration:

- The graph is not decorative.
- The backend owns the graph slice; the frontend renders it.
- Assumptions are first-class claims connected by dependency edges.

### 3. Autopilot ranks the next move

Action: trigger `POST /autopilot/tick`.

Backend evidence:

- `next_move_recomputed`
- `autopilot_candidate_generated`
- `autopilot_focus_suggested`

Expected suggestion:

- Focus the low-confidence market assumption: founders will use structured thinking guidance during ambiguous company decisions.

Narration:

- Penny chooses the next move because this assumption is low-confidence and load-bearing.
- The explanation must be visible before the user acts.
- Autopilot suggests focus; it does not silently change truth.

### 4. Click "Go there"

Action: accept the suggested focus.

Backend evidence:

- `autopilot_focus_started`

Narration:

- The user remains in control.
- "Go there" starts the suggested focus; it does not revise claims or confidence.

### 5. Issue the challenge

Action: challenge the focused assumption.

Backend evidence:

- `challenge_issued`

Expected challenge:

- Founders may say they want better thinking, but under pressure they may default to speed, advisors, or generic AI chat instead of a structured map.

Narration:

- Penny challenges the weakest load-bearing part of the idea.
- The challenge is attached to the graph as a critique claim and challenge edge.

### 6. Demonstrate manual override

Action: select the high-confidence unsupported claim instead of following the current Autopilot suggestion.

Backend evidence:

- `manual_node_selected`

Expected result:

- Focus moves to the selected claim.
- Autopilot is paused.
- The override becomes history Penny can learn from later.

Narration:

- Manual control is not an escape hatch outside the system.
- The override itself becomes a Move.

### 7. Respond with Revise

Action: revise the unsupported claim into a narrower claim.

Example revision:

> Penny can be more useful than generic AI chat for founders when the task requires preserving assumptions, challenges, and decision history across a thinking session.

Backend evidence:

- `claim_revised`
- previous ClaimVersion preserved
- new current ClaimVersion created

Narration:

- The old claim does not disappear.
- Penny keeps the history of how the founder's thinking changed.

### 8. Recompute the next move

Action: trigger `POST /autopilot/tick` again after the challenge response.

Backend evidence:

- `next_move_recomputed`
- `autopilot_candidate_generated`
- `autopilot_focus_suggested`

Expected suggestion:

- Create the Challenge Brief if the loop has enough structure and at least one challenge response.

Narration:

- Penny notices the loop has reached an artifact boundary.
- It recommends synthesis rather than infinite engagement.

### 9. Create the Challenge Brief

Action: accept artifact creation.

Backend evidence:

- `artifact_created`

Expected brief sections:

- original idea
- claim map summary
- load-bearing assumptions
- weakest challenge
- user response
- revised claim history
- unresolved risk
- recommended next move

Narration:

- The artifact is derived from the graph and moves.
- The user leaves with a concrete founder brief, not a chat transcript.

## Success Bar

- The demo shows a graph before it shows prose.
- Every visible state change has a backend move.
- The suggested focus has a reason.
- Manual override pauses Autopilot.
- Revise preserves the old claim version.
- The Challenge Brief is created from canonical state.
- No GET request changes backend state.
- No frontend-only state is presented as canonical thinking history.
