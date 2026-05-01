# YC MVP Demo

Status: P3 final demo path  
Seed idea: `Penny is the most consistently efficient way to evoke creativity and turn it into structured, source-grounded thinking.`

## Goal

Show one reliable loop: Learn structures a raw idea, Autopilot recommends the next move, the user can Check or Verify, the result can be saved to Brain, Canvas shows the structure, and related Brain context can be found again.

## Demo Script

1. Open Penny.
2. Confirm the first visible mode is `Learn`.
3. Drop the seed idea:
   `Penny is the most consistently efficient way to evoke creativity and turn it into structured, source-grounded thinking.`
4. Penny should return a structured Learn result:
   - core idea about making creativity inspectable, challengeable, and source-grounded
   - claims
   - assumptions
   - questions
   - Learn concepts such as `source-grounded thinking` and `structured creativity`
5. Point out Autopilot's next move.
   Expected: Check or Verify should be the highest-leverage next action because the seed contains a load-bearing creativity mechanism and a source-grounding claim.
6. Click `Check` or `Verify`.
   Expected: the app moves into the Check surface or Verify panel without losing the session.
7. Save the Learn output to Brain.
   Expected: Brain stores a saved object tied to the session.
8. Open Brain.
   Expected: the saved object appears in Brain with the original seed/session context.
9. Open Canvas.
   Expected: Canvas shows the path:
   `idea -> claims -> assumptions -> questions -> source/evidence/next move`
10. Ask or find related Brain context.
    Expected: related Brain search returns the saved Learn/Brain context for the same idea.

## What To Say

- Penny is not a chatbot. The visible product is the thinking structure: Learn, Check, Brain, and Canvas over the same state.
- The first win is not prose. It is converting an ambitious claim into claims, assumptions, questions, a next move, and durable Brain context.
- Autopilot is useful when it chooses the next thinking action, not merely the next graph node.
- Brain is the durable store. Canvas and Learn are projections over Brain-owned objects.
- Source-grounding is visible as a Verify path and related Brain context, not hidden inside generic generation.

## Required Proof Points

- `Learn` is the first top-level mode.
- The exact demo seed produces useful structured output without live AI credentials through the heuristic fallback.
- Autopilot recommends Check or Verify for the demo seed's fragile mechanism/source-grounding claim.
- Save to Brain creates a saved object.
- Canvas exposes claim/source/Brain-object/next-move structure.
- Brain search can find related saved context.

## Current Demo Risks

- Browser-level clickthrough is still not fully automated; source/API and component tests cover the path, but a live visual walkthrough should still be done before any investor demo.
- Live model output may vary when real provider credentials are enabled; the heuristic fallback is stable and should remain available for demos.
- Verify source quality depends on available provider/search configuration. For demo reliability, keep the local Brain context path ready even if web/provider search is unavailable.
- Legacy route aliases still exist for compatibility. The demo should stay on session-scoped routes.
