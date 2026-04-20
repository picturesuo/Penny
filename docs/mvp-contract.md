# MVP Contract

## Step 1 Freeze

Penny's current MVP is a claim-centered challenge loop where the user can select a claim, run a challenge round, submit a response, and see the saved result in a durable audit trail.

This document is the operational contract for the next ship window. It exists to stop the signed-in product from trying to represent the whole roadmap at once.

## Decision Rule

For every visible element in the main signed-in flow, ask:

Does this help the user complete the claim -> challenge -> response -> saved result loop today?

If yes, keep it visible.
If no, hide it, demote it, or park it here.

## Canonical MVP Path

### Single Best Entrypoint

- Signed-in users should enter through `/app`.
- `/dashboard` is a transparent alias of `/app`, not a separate product home.
- `/` remains the public landing page and should only hand off into auth or the signed-in app.

### Single Best First Action

- On `/app`, the obvious first move is `Open latest map` when a recent map exists.
- If the user has no maps yet, the obvious first move is `New map`.
- Once inside a map, the obvious first move is to select or create one claim to challenge.

### Exact Success Sequence

1. User lands on `/app`.
2. User opens an existing map or creates a new map.
3. User enters `/app/maps/[id]`.
4. User selects a claim or captures one if the map is empty.
5. User passes through the steel-man checkpoint if it is part of the live claim flow.
6. User starts one challenge round.
7. User writes and submits one valid response.
8. User sees the completed round persisted in the visible audit trail.

That sequence is the current definition of MVP success. Anything outside it is support work or future work.

## Primary Surfaces

- Primary signed-in home: `/app`
- Primary workspace route: `/app/maps/[id]`
- Primary signed-in home surface: `src/app/app/page.tsx`
- Primary map workspace wrapper: `src/components/penny/map-workspace.tsx`
- Primary challenge loop surface: `src/components/penny/thought-map-workspace.tsx`
- Primary round card: `src/components/penny/challenge-round.tsx`

## In Scope For This MVP

- map access from the signed-in home
- map creation if the user has no existing map
- claim selection
- claim capture when a map is empty or missing the target claim
- steel-man checkpoint when the live flow requires it
- challenge round UI
- response submission
- confidence update when it is already part of the round contract
- saved round history and audit trail
- explicit success and failure states around round persistence

## Hidden Or Demoted For Now

These ideas are preserved, not deleted. They should stop competing with the core loop in the signed-in journey.

- big multi-lane Brain / Challenge / Learn framing inside the signed-in app
- future dashboard panels that do not help open a map and run one round
- vault, export, import, community, and curriculum surfaces in the main navigation path
- advanced lens and shape explanations
- speculative best-next-move expansions not required to finish one round
- extra map modes that split attention before the first completed round
- synthesis and artifact layers unless the current flow cannot avoid them
- side surfaces such as search, lessons, velocity, identity, and unlocks as advertised primary navigation targets during the MVP pass

Hidden in this contract means one of three things:

- remove from primary navigation
- collapse behind an internal-only or coming-later section
- leave the route and code intact but stop advertising it in the main journey

## Preserved For Later

- The long-term Brain / Challenge / Learn product framing is still the strategy.
- Lens, shape, learning, and synthesis work remain valid follow-on bets.
- Supporting routes and code can remain in the repo as long as they stop interrupting the claim challenge loop.

## Parking Lot

This document is the durable parking lot for ideas that matter but should not drive the MVP surface yet.

### Hidden For MVP

- Idea: multi-lane Brain / Challenge / Learn framing inside the signed-in app
  Why it matters: it explains the long-term structure of the product.
  Why it is hidden now: it creates cognitive branching before the user completes one challenge round.
  Bring it back when: the core map-to-round loop is stable and the signed-in home no longer needs roadmap framing to justify itself.

- Idea: future dashboard panels and secondary home surfaces
  Why it matters: they can later expose history, velocity, learning, and strategic context.
  Why it is hidden now: they compete with the only action that currently proves product value, opening a map and challenging one claim.
  Bring it back when: the home surface already drives most users into a completed round and needs a second priority after that.

- Idea: vault, export, import, community, and curriculum surfaces in the main journey
  Why it matters: they can deepen retention, portability, collaboration, and learning over time.
  Why it is hidden now: they widen the first-run interface without helping the user finish one critique loop.
  Bring it back when: the core round flow is clear enough that one of these surfaces becomes an obvious second job rather than a distraction.

- Idea: advanced lens and shape explanation layers
  Why it matters: they are part of Penny's long-term non-wrappable behavior.
  Why it is hidden now: they explain the model before the user has seen one strong visible output from the model.
  Bring it back when: personalized critique quality is visibly better and needs explanation or inspection.

### Next After MVP

- Idea: tighter home-to-map handoff and stronger empty states
  Why it matters: the MVP path should become faster and more obvious after the first freeze.
  Why it is hidden now: Step 1 is about deciding the path, not redesigning every screen at once.
  Bring it back when: the UI cut list begins and the canonical path is being enforced in code.

- Idea: explicit post-round next step suggestions
  Why it matters: users will eventually need help deciding what to do after one saved response.
  Why it is hidden now: the product first needs to prove that one completed round is valuable on its own.
  Bring it back when: users can reliably complete one round and the main confusion shifts to what to do next.

### Future Years / Big Bets

- Idea: full Brain / Challenge / Learn system as a coherent product city
  Why it matters: this is the strategic product ambition and differentiation.
  Why it is hidden now: the repo is not failing from lack of ambition; it is failing from too many ambitions being visible at once.
  Bring it back when: the MVP loop is strong enough to support a broader product language without dissolving clarity.

- Idea: rich lens-driven critique, learning, and precedent behavior
  Why it matters: it is a large part of the long-term moat.
  Why it is hidden now: the user should first feel one concrete pressure-testing loop work before seeing the full model story.
  Bring it back when: the personalized output is measurably useful and inspectable enough to justify foregrounding.

### Needs Backend First

- Idea: deeper AI-backed challenge generation and richer critique state
  Why it matters: challenge quality determines whether the loop teaches anything real.
  Why it is hidden now: frontend exposure should not outrun the singular server-backed critique path.
  Bring it back when: the server contract is stable enough that better generation quality can be surfaced without multiplying paths.

- Idea: broader lesson and synthesis surfaces
  Why it matters: they will eventually turn critique history into durable learning and outputs.
  Why it is hidden now: they depend on a trustworthy move and round history substrate.
  Bring it back when: the persisted critique loop is stable, legible, and rich enough to support derived products.

### Needs UX Rethink

- Idea: extra map modes and multi-surface navigation breadth
  Why it matters: different work modes may matter later for different cognitive jobs.
  Why it is hidden now: the current result is split attention before the user has completed one meaningful action.
  Bring it back when: the single canonical workspace is clearly insufficient for a real repeated user task.

- Idea: roadmap-forward explanations inside the product shell
  Why it matters: they communicate ambition and product direction.
  Why it is hidden now: they currently substitute for a clear first task instead of supporting it.
  Bring it back when: the product can explain itself through the main loop and no longer needs roadmap copy to carry the experience.

## Acceptance Criteria For Step 1

- there is one canonical path, not several competing homes
- the signed-in home has one obvious first move
- the primary workspace is the claim-focused map route
- the exact success sequence ends at a persisted round in the audit trail
- non-essential ideas are hidden or demoted, not erased
- future ideas are parked in this file instead of being advertised in the interface

## Reconciliation Notes

- Earlier repo language treated the MVP as a broader capture, challenge, learn, and artifact system. For the next ship window, this contract narrows the visible product to the claim challenge loop.
- Earlier repo language also treated `/dashboard` and `/app` inconsistently. The live code makes `/dashboard` an alias of `/app`, and this contract follows the code.
