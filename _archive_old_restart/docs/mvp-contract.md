# MVP Contract

## Step 1 Freeze

Penny's current MVP is a claim-centered challenge loop where the user can select a claim, run a challenge round, submit a response, and see the saved result in a durable audit trail.

This document is the operational contract for the next ship window. It exists to stop the signed-in product from trying to represent the whole roadmap at once.

## Decision Rule

For every visible element in the main signed-in flow, ask:

Does this help the user complete the claim -> challenge -> response -> saved result loop today?

If yes, keep it visible.
If no, hide it, demote it, or park it in `docs/mvp-parking-lot.md`.

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

The hidden-product backlog now lives in one place:

- `docs/mvp-parking-lot.md`

Use that file for:

- hidden-for-MVP ideas
- next-after-MVP ideas
- later ideas
- future-years / big bets
- backend-blocked ideas
- UX-rethink ideas
- evidence-gated reintroduction

## Acceptance Criteria For Step 1

- there is one canonical path, not several competing homes
- the signed-in home has one obvious first move
- the primary workspace is the claim-focused map route
- the exact success sequence ends at a persisted round in the audit trail
- non-essential ideas are hidden or demoted, not erased
- future ideas are parked in `docs/mvp-parking-lot.md` instead of being advertised in the interface

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

- Park search recovery as a `Next After MVP` support workflow in `docs/mvp-parking-lot.md` rather than a primary nav destination.

- Park founder brief, artifact generation, export, and vault under `Needs Backend First` or `Next After MVP` in `docs/mvp-parking-lot.md`, depending on whether the next ship window still centers the challenge loop.

- Park lens, shape, precedent, and meta-cognition explanation layers under `Future Years / Big Bets` and `Needs UX Rethink` in `docs/mvp-parking-lot.md`.

- Park session-first and multi-mode workflows under `Needs UX Rethink` in `docs/mvp-parking-lot.md` until the single map workspace is clearly insufficient.

- Park broad dashboard expansion, velocity surfaces, and extra home panels under `Hidden For MVP` in `docs/mvp-parking-lot.md` until the home screen no longer needs to fight for hierarchy.

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

## Step 3 Trust And Completion Contract

This section defines what the narrowed MVP path has to feel like in use. The goal is not broader scope. The goal is to make the surviving loop truthful enough to learn from.

### The Trust Standard

For the current MVP, trustworthy means:

- the UI always tells the truth
- the product does not silently fail
- success is visible and specific
- failure is visible and actionable

If the interface implies more certainty than the persistence layer has earned, the loop is still prototype-grade.

### Current Trust Path

The load-bearing loop is:

1. user enters the map workspace
2. user sees which claim is in focus
3. user starts one challenge round
4. user writes a response
5. user submits the response
6. user knows whether it saved
7. user sees the saved result reflected back in the round history

### Required Visible States

The core round flow must make these states legible:

- no active response yet
- draft in progress
- submission in progress
- submission succeeded
- submission failed

### Truth Rules For The Current Challenge Round

- The round card must stay open while the response is still a draft.
- The submit button must disable while the request is in flight.
- The loading state must name the action, not just show a spinner with no meaning.
- A round must not appear completed until persistence actually succeeds.
- A failed save must keep the response draft, selected response path, and confidence state intact.
- A saved round must be reflected in visible history, not only implied by a toast or button change.
- Validation messages must name the real contract, including the trimmed 10-character response floor and the 0-100 confidence bounds.

### What Success Must Look Like

- the completed round shows the saved user response
- the round reads as completed rather than merely dismissed
- the confidence change is shown as the saved start-to-end delta
- the prior-round trail remains visible
- the user can tell what was stored without reloading or guessing

### What Failure Must Look Like

- invalid response stays invalid and does not collapse the interaction
- failed persistence keeps the round in an editable state
- the error copy is direct and actionable
- failure cannot be mistaken for completion

Preferred failure copy is blunt and contract-bound:

- `Response must be at least 10 non-space characters.`
- `Couldn't save this round. Try again.`
- `Confidence must be between 0 and 100.`

### Recovery Rules

- preserve the typed response on failure
- preserve the selected response path on failure
- preserve the confidence input on failure
- do not kick the user to another screen
- do not reset the whole round card unless the user explicitly starts a different round

### Hierarchy Rules For The Core Screen

The round UI should read in this order:

1. claim in focus
2. challenge prompt
3. response field
4. response-path selection
5. confidence input
6. submit action
7. saved result and prior rounds

Secondary material should stay quieter than the next required action.

### Highest-Value Polish Order

1. truthful submit behavior
2. clear error handling
3. obvious saved state
4. input preservation on failure
5. visual hierarchy around the next action
6. copy tightening
7. cosmetic polish

### Current Penny-Specific Application

In the live challenge-round slice, Step 3 should hold the line on these points:

- starting a round must clearly open a live interaction
- the claim in view must stay obvious
- the response field must communicate the real minimum bar
- the submit button must reflect in-flight work
- failed POSTs must not produce a completed-looking card
- successful POSTs must visibly update the saved round trail
- saved confidence movement must read as part of the persisted round outcome
- current-round input must stay visually distinct from prior rounds

### Acceptance Criteria For Step 3

- the user always knows the next action
- the submit flow shows visible draft, loading, success, and failure states
- success is reflected in saved history, not just implied
- failure never masquerades as completion
- the user’s work is preserved when something goes wrong
- the core challenge screen feels narrow, intentional, and safe to iterate on
