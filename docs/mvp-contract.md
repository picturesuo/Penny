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

## Step 2 UI Cut List

This section translates the frozen MVP path into an explicit UI sorting rule for the current app.

Every visible route, panel, nav item, card, and CTA should fall into one of four buckets:

- Keep visible now
- Demote but keep accessible
- Hide for MVP
- Park for later in the parking lot above

### Current Scope

This cut list is for the current signed-in path:

- `src/app/app/page.tsx`
- `src/components/penny/home-dashboard.tsx`
- `src/components/penny/nav.tsx`
- `src/app/app/maps/[id]/page.tsx`
- `src/components/penny/map-workspace.tsx`
- `src/components/penny/thought-map-workspace.tsx`
- `src/components/penny/challenge-round.tsx`

### Keep Visible Now

- `src/components/penny/nav.tsx`
  Keep the `Penny` home link, `Maps`, and `New map`.

- `src/components/penny/home-dashboard.tsx`
  Keep the `Start with a claim` hero, the `Open latest map` CTA, the empty-state `Create your first map` CTA, and the recent maps grid.

- `src/components/penny/map-workspace.tsx`
  Keep the map title and the `ClaimCaptureLauncher`.

- `src/components/penny/thought-map-workspace.tsx`
  Keep `Outline view` as the default working mode.

- `src/components/penny/thought-map-workspace.tsx`
  Keep the active claim selection flow and the claim card `Challenge` action.

- `src/components/penny/thought-map-workspace.tsx`
  Keep the live steel-man checkpoint because it is already part of the challenge loop contract.

- `src/components/penny/challenge-round.tsx`
  Keep the challenge round card, response-path selection, confidence capture, submit state, and the completed-round state.

- `src/components/penny/challenge-round.tsx`
  Keep visible claim context and the saved prior-round / audit-trail payoff after submission.

- `src/components/penny/thought-map-workspace.tsx`
  Keep explicit persistence success and failure states around challenge round submission.

### Demote But Keep Accessible

- `src/components/penny/nav.tsx`
  Demote `Settings` out of the primary action row. It should stay reachable, but not read as a co-equal task with opening a map.

- `src/components/penny/map-workspace.tsx`
  Demote the claim-count and artifact-count badges. They are context, not the job.

- `src/components/penny/map-workspace.tsx`
  Demote the `Latest artifact` card below the core map-opening action or collapse it behind a secondary section.

- `src/components/penny/challenge-round.tsx`
  Demote `Why this challenge` and the deeper argument/provenance reading behind disclosure, which the current component already supports.

- `src/components/penny/challenge-round.tsx`
  Demote the expanded prior-round detail behind the current expander instead of letting history dominate first-pass attention.

- `src/components/penny/thought-map-workspace.tsx`
  Demote `Graph view` and keep `Outline view` primary. The graph should remain a structural aid, not a co-equal starting mode.

- `src/components/penny/thought-map-workspace.tsx`
  Demote the graph-side `Knowledge card`, score highlights, structural health, dependency health, evidence quality, and revisit trigger controls behind the graph path rather than the default path.

- `src/components/penny/thought-map-workspace.tsx`
  Demote critique feedback and optional summaries so they appear after a round, not before the user knows what to do.

### Hide For MVP

- `src/components/penny/nav.tsx`
  Hide the primary-nav `Search` button from the default action row.

- `src/components/penny/nav.tsx`
  Hide `QuickCapture` from the primary row. It competes with `New map` and opening an existing map.

- `src/components/penny/thought-map-workspace.tsx`
  Hide the founder-brief section headed `Turn the map into a decision artifact.`

- `src/components/penny/thought-map-workspace.tsx`
  Hide the `Generate founder brief`, `Move to Vault`, and `Export` CTAs from the main map flow.

- `src/components/penny/thought-map-workspace.tsx`
  Hide `ArtifactBuilder` from the core workspace path.

- `src/components/penny/thought-map-workspace.tsx`
  Hide `DocumentImport` from the main challenge path.

- `src/components/penny/thought-map-workspace.tsx`
  Hide `VaultModal` and `ExportModal` entrypoints from the main challenge path.

- `src/components/penny/thought-map-workspace.tsx`
  Hide the session gate, session start, and session close flow from the MVP surface unless they are strictly required to unlock the workspace.

- `src/components/penny/thought-map-workspace.tsx`
  Hide the lens, shape, and meta-cognition explanation surfaces, including `Lens freshness`, `Move query lens`, `Shape callout`, and related teaching panels.

- `src/components/penny/thought-map-workspace.tsx`
  Hide deep history and theory panels such as `Timeline views`, `Old selves`, `Belief archaeology`, `Belief genealogy`, `Source/session audit`, `Claim dependency graph`, and `Aging foundations monitor`.

- `src/components/penny/thought-map-workspace.tsx`
  Hide secondary system panels such as `Challenge-skill calibration`, broad revisit tooling, and other optional analysis surfaces that make the user ask whether they should do that first.

- `src/app/app/search/page.tsx`
  Hide search as an advertised primary route during MVP stabilization.

- `src/app/app/velocity/page.tsx`
  Hide the velocity dashboard from the main path.

- `src/app/app/session/[id]/page.tsx`
  Hide session workspace entry as a first-class route in the signed-in journey.

### Park For Later

These stay preserved in the parking lot above rather than remaining loud in the product shell.

- Park search recovery as a `Next After MVP` support workflow rather than a primary nav destination.

- Park founder brief, artifact generation, export, and vault under `Needs Backend First` or `Next After MVP`, depending on whether the next ship window still centers the challenge loop.

- Park lens, shape, precedent, and meta-cognition explanation layers under `Future Years / Big Bets` and `Needs UX Rethink`.

- Park session-first and multi-mode workflows under `Needs UX Rethink` until the single map workspace is clearly insufficient.

- Park broad dashboard expansion, velocity surfaces, and extra home panels under `Hidden For MVP` until the home screen no longer needs to fight for hierarchy.

### Immediate Cut Order

1. Remove duplicate or competing entrypoints from attention.
   That means `/app` stays primary, while `/dashboard`, search, sessions, and other side routes stop reading like equal starting places.

2. Remove future-facing panels from the map workspace.
   Founder brief, artifact generation, vault, export, and import should stop sitting beside the challenge loop.

3. Collapse secondary context.
   Graph-heavy inspection, provenance reading, and deeper history stay available, but they move behind view toggles, disclosure, or lower-priority placement.

4. Remove action competition.
   In nav and above the fold, `Open latest map`, `New map`, and `Challenge` should clearly outrank everything else.

5. Strip explanatory product theory from the signed-in path.
   The user should not need to parse Penny's long-term philosophy before running one round.

### The Main-Screen Test

After this cut, the signed-in product should answer three questions immediately:

- Where am I?
  In a claim-centered map workspace.

- What should I do next?
  Open a map or challenge the active claim.

- Did it work?
  The round submission either appears in the saved audit trail or shows a clear failure state.
