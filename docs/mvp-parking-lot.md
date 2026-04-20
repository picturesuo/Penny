# MVP Parking Lot

This file is the single durable home for Penny ideas that are not on the current MVP surface.

The purpose is not deletion. The purpose is state change:

- visible now
- hidden for MVP
- next after MVP
- later
- future years / big bets
- needs backend first
- needs UX rethink
- reintroduce only after evidence

This file is for deferred ambition. It is not a place to hide unresolved MVP integrity work.

## Not Parked

These are required now and must not be mislabeled as “later”:

- explicit failure handling in the challenge loop
- persistence integrity
- validation consistency
- visible saved state
- preserving user input on failed submission
- clear entrypoint and next action

## Entry Schema

Every parked idea uses the same fields:

- Idea
- Category
- Current status
- Why it matters
- Why hidden now
- Re-entry trigger
- Where it belongs later
- Dependencies
- Notes

## Hidden For MVP

### P-001

- Idea: Brain / Challenge / Learn framing inside the signed-in app
- Category: product framing
- Current status: hidden for MVP
- Why it matters: it explains the larger product architecture and long-term direction.
- Why hidden now: the signed-in app needs one obvious job, not three conceptual lanes competing before the user finishes one round.
- Re-entry trigger: users can complete one challenge round without confusion and the home surface no longer needs roadmap copy to orient them.
- Where it belongs later: quiet product-language framing around the signed-in home, not as competing primary actions.
- Dependencies: stable challenge loop, validated home hierarchy
- Notes: keep the strategy alive without making the interface read like a roadmap.

### P-002

- Idea: richer dashboard panels beyond map access
- Category: dashboard
- Current status: hidden for MVP
- Why it matters: they can later expose memory, learning, velocity, and deeper context.
- Why hidden now: the current home needs to get the user into a map and toward one round, not ask them to parse multiple secondary systems.
- Re-entry trigger: the `/app` home reliably sends users into the core loop and there is evidence that a second priority belongs there.
- Where it belongs later: lower-priority dashboard sections beneath map access and recent-work actions.
- Dependencies: stable core loop, tested home hierarchy
- Notes: includes future home panels that are interesting but not needed before the first completed round.

### P-003

- Idea: search as an advertised primary destination
- Category: retrieval
- Current status: hidden for MVP
- Why it matters: deterministic recovery across maps, claims, sessions, artifacts, and shapes is useful once the archive becomes real.
- Why hidden now: search competes with opening a map even though the MVP question is whether one challenge loop works.
- Re-entry trigger: users have enough real history that recovery becomes a visible repeated need.
- Where it belongs later: secondary nav or command-access entry, not equal weight with opening a map.
- Dependencies: stable user archive, validated main nav
- Notes: search can stay in code and route space without remaining loud in the default journey.

### P-004

- Idea: velocity and broader meta dashboards
- Category: dashboard
- Current status: hidden for MVP
- Why it matters: they surface whether the user’s thinking is compounding over time.
- Why hidden now: they are downstream interpretation layers on top of a loop that is still being stabilized.
- Re-entry trigger: the challenge loop is stable and there is enough history to make the metrics feel earned instead of decorative.
- Where it belongs later: a secondary dashboard lane, not the first-pass home experience.
- Dependencies: stable move history, longitudinal data
- Notes: includes velocity-first framing and similar secondary analytics surfaces.

## Next After MVP

### P-005

- Idea: just-in-time learning scaffold tied to challenge confusion
- Category: learn
- Current status: next after MVP
- Why it matters: it makes Penny teach through the active claim instead of sending the user into generic research.
- Why hidden now: the challenge-response-save loop still needs to prove it can stand on its own without another primary lane.
- Re-entry trigger: users can complete one challenge round without confusion and saved-state behavior is trustworthy.
- Where it belongs later: inline beneath or beside challenge results, subordinate to the active claim rather than as a separate top-level lane.
- Dependencies: stable challenge outcome model, concept-gap detection
- Notes: keep it tied to the active claim, not as a competing dashboard workflow.

### P-006

- Idea: post-round best-next-step guidance
- Category: workflow
- Current status: next after MVP
- Why it matters: it helps the user decide what to do after one saved round instead of stalling.
- Why hidden now: the current job is proving that one completed round already feels valuable and trustworthy.
- Re-entry trigger: successful one-round sessions are common and the next major confusion becomes “what should I do now?”
- Where it belongs later: directly beneath the saved round result, not as a separate planning panel above the fold.
- Dependencies: stable round outcomes, validated trust states
- Notes: this should remain specific to the active claim, not turn into a general task manager.

### P-007

- Idea: tighter map-home handoff and stronger empty-state guidance
- Category: workflow
- Current status: next after MVP
- Why it matters: it can reduce the time from sign-in to first meaningful challenge round.
- Why hidden now: Step 1-3 already froze the path and made it trustworthy; this is the next optimization layer, not the current blocker.
- Re-entry trigger: the current path works in testing and the next bottleneck is speed or clarity entering the first map.
- Where it belongs later: `/app` hero and empty-state refinements.
- Dependencies: validated canonical path
- Notes: this is the likely first design iteration once the MVP loop is honest.

## Later

### P-008

- Idea: broader precedent retrieval layers
- Category: challenge
- Current status: later
- Why it matters: richer precedent support can make critiques more specific and more valuable over time.
- Why hidden now: the current MVP only needs one working challenge loop, not the full precedent surface.
- Re-entry trigger: real usage shows that users want stronger historical analogs during critique, and the core challenge loop is already stable.
- Where it belongs later: inside the challenge explanation or saved-result context, not as a parallel browsing mode.
- Dependencies: precedent corpus quality, stable retrieval behavior
- Notes: keep precedent subordinate to the round, not a separate discovery destination.

### P-009

- Idea: broader learning-loop surfaces beyond the current challenge contract
- Category: learn
- Current status: later
- Why it matters: they deepen retention and turn confusion into durable understanding.
- Why hidden now: they depend on observing actual challenge behavior first rather than guessing the right visible learning surface.
- Re-entry trigger: repeated real usage reveals specific confusion patterns or demand for learning support.
- Where it belongs later: inline in claim work or post-round follow-up, not as a competing home lane.
- Dependencies: challenge history, confusion detection, tested hierarchy
- Notes: this is different from the immediate post-MVP inline learning scaffold.

### P-010

- Idea: broader reflection and session ritual layers
- Category: session
- Current status: later
- Why it matters: reflection and clean endings can become a trust signal and produce durable metacognitive value.
- Why hidden now: the current session surfaces add conceptual weight before the core map-to-round loop is fully validated.
- Re-entry trigger: users complete the main loop reliably and there is evidence that explicit reflection adds value rather than friction.
- Where it belongs later: end-of-session or post-round reflection areas, not as a gate before the core action.
- Dependencies: stable loop, session model worth exposing
- Notes: reflection should remain optional-but-rewarded when it returns.

## Future Years / Big Bets

### P-011

- Idea: full Brain / Challenge / Learn system as a coherent product city
- Category: strategy
- Current status: future years / big bet
- Why it matters: this is the larger product ambition and part of the long-term moat.
- Why hidden now: the current failure mode is not lack of ambition; it is too much ambition being visible at once.
- Re-entry trigger: the core loop is strong enough that broader product language clarifies the experience instead of fragmenting it.
- Where it belongs later: holistic signed-in architecture and product narrative.
- Dependencies: strong core loop, repeated user behavior, validated hierarchy
- Notes: do not let the strategy vanish, but do not let it dominate the MVP surface either.

### P-012

- Idea: rich lens and shape explanation surfaces
- Category: lens / shapes
- Current status: future years / big bet
- Why it matters: they are central to Penny’s long-term personalization and non-wrappability story.
- Why hidden now: explaining the model before the user has felt one trustworthy loop makes the product read as theory-heavy.
- Re-entry trigger: personalized critique quality is measurably better and users need inspection or explanation to trust it.
- Where it belongs later: quiet explanation, inspectable evidence panels, or advanced settings around critique behavior.
- Dependencies: mature lens pipeline, evidence-backed shape derivation, clear UI placement
- Notes: includes lens freshness, shape callouts, and shape-teaching surfaces as visible product layers.

### P-013

- Idea: community and curriculum features
- Category: expansion
- Current status: future years / big bet
- Why it matters: they could open new distribution and learning pathways for students, teachers, and collaborative use cases.
- Why hidden now: they widen both audience and workflow shape before the individual claim loop is trustworthy.
- Re-entry trigger: the individual product is stable and there is evidence for collaborative or educational pull.
- Where it belongs later: distinct product layers or clearly separated modes, not mixed into the MVP shell.
- Dependencies: stable individual workflows, permission model, broader product validation
- Notes: includes curriculum packs, instructor views, and classroom pattern layers.

## Needs Backend First

### P-014

- Idea: deeper AI-backed challenge generation
- Category: challenge
- Current status: needs backend first
- Why it matters: challenge quality determines whether the loop teaches anything real.
- Why hidden now: frontend exposure should not outrun the single server-backed critique path.
- Re-entry trigger: the backend contract for challenge generation is stable enough that better generation quality can be surfaced without multiplying flows.
- Where it belongs later: behind the existing challenge-generation boundary, with stronger visible critique quality rather than extra surface area.
- Dependencies: stable AI route, provider behavior, quality controls
- Notes: this is deferred ambition, not permission to leave the current challenge loop flaky.

### P-015

- Idea: synthesis expansions beyond the current saved round loop
- Category: synthesis
- Current status: needs backend first
- Why it matters: richer synthesis can turn challenge history into durable outputs and artifacts.
- Why hidden now: synthesis depends on reliable persisted moves and round results, and should not distract from proving the core loop first.
- Re-entry trigger: the persisted challenge loop is stable and the output model is trustworthy enough to support derivative artifact work.
- Where it belongs later: after the saved challenge history, not in front of it.
- Dependencies: stable move history, artifact model, synthesis routing
- Notes: includes broader artifact expansions beyond the minimal current path.

### P-016

- Idea: import / export / vault as visible product layers
- Category: infrastructure-facing product
- Current status: needs backend first
- Why it matters: portability, privacy, and ingest become important once the core system is worth investing in.
- Why hidden now: they are support capabilities, not part of the first successful challenge loop, and they add too many parallel promises when surfaced early.
- Re-entry trigger: users trust the core loop, and there is either clear demand for privacy/portability or enough backend support to expose them safely.
- Where it belongs later: secondary utilities around the workspace, not above the challenge action.
- Dependencies: durable storage behavior, export contracts, privacy guarantees
- Notes: these can exist in code now without being part of the MVP journey.

## Needs UX Rethink

### P-017

- Idea: graph-heavy primary workflows
- Category: workspace
- Current status: needs UX rethink
- Why it matters: graph structure is valuable for zooming out and understanding claim relationships.
- Why hidden now: making it visually co-equal with the claim challenge path splits attention before the user finishes one round.
- Re-entry trigger: the outline-first workspace is clearly insufficient for repeated real usage or graph behavior becomes essential to task completion.
- Where it belongs later: structural minimap, secondary mode, or carefully scoped analysis view.
- Dependencies: validated primary workflow, clearer graph role
- Notes: advanced graph tooling should stay subordinate to claim work unless evidence proves otherwise.

### P-018

- Idea: session-first and ritual-first flows as visible gates
- Category: workflow
- Current status: needs UX rethink
- Why it matters: focused sessions and clean endings may become a real differentiator.
- Why hidden now: visible session gating before the core challenge loop makes the product feel like a broader system before it has earned that complexity.
- Re-entry trigger: real users benefit from explicit session boundaries and the session surface has a clear place in the path.
- Where it belongs later: optional deep-work mode or end-of-loop ritual, not a default blocker.
- Dependencies: validated loop, tested session placement
- Notes: the question is not whether sessions matter; it is where they belong.

### P-019

- Idea: roadmap-like explanation panels and theory-heavy signed-in copy
- Category: product framing
- Current status: needs UX rethink
- Why it matters: Penny has real depth and may eventually need to explain itself.
- Why hidden now: theory-heavy explanation currently substitutes for a clear next action instead of supporting one.
- Re-entry trigger: the product can explain itself through visible behavior and only needs light scaffolding for advanced users.
- Where it belongs later: subtle onboarding, help, or advanced explanation layers.
- Dependencies: stronger behavioral clarity, validated core flow
- Notes: explanation should follow demonstrated value, not precede it.

## Reintroduce Only After Evidence

### P-020

- Idea: broader dashboard, retrieval, and memory surfaces as a second lane
- Category: evidence-gated expansion
- Current status: reintroduce only after evidence
- Why it matters: they may increase retention once the user has enough accumulated history to revisit.
- Why hidden now: without evidence of repeated return behavior, they are just extra branches in the interface.
- Re-entry trigger: real usage shows users finish one round successfully, return to existing maps, and need a second workflow beyond the core loop.
- Where it belongs later: secondary lane after the challenge path proves sticky.
- Dependencies: repeated usage, stable saved history, observed demand
- Notes: this bucket exists to stop “important later” from pretending to be “important now.”
