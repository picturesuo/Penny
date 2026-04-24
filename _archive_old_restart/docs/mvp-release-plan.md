# MVP Release Plan

This file defines what Penny is shipping in the current MVP pass and what the release is supposed to teach us.

It is not a roadmap. It is the release guardrail for the narrowed product.

## Shipped Surface

The shipped MVP is the smallest honest version of Penny that can produce reliable feedback.

### Canonical Path

1. User enters the signed-in app through `/app`.
2. User opens an existing map or creates a new map.
3. User enters `/app/maps/[id]`.
4. User focuses one claim.
5. User starts one challenge round.
6. User writes one response.
7. User submits the response.
8. User sees whether it saved.
9. User sees the saved round reflected in the visible audit trail.

### Primary User-Facing Surface

- Signed-in entry: `/app`
- Primary first action: `Open latest map` or `New map`
- Primary workspace: `/app/maps/[id]`
- Primary interaction: challenge one claim
- Primary payoff: saved round history and audit trail

### Intentional States

The shipped loop must make these states visible:

- draft
- submitting
- saved
- failed

### Intentionally Hidden From The Shipped MVP

These stay out of the main shipped path by default:

- search as a primary destination
- founder brief and broader artifact generation
- vault, export, and import as loud workspace actions
- session-first flows
- lens and shape explanation layers
- velocity and other broad dashboard expansions
- roadmap-forward or theory-heavy signed-in framing

The hidden backlog lives in `docs/mvp-parking-lot.md`.

## Release Questions

This release is meant to answer these questions:

- Did the user understand where to start without explanation?
- Did the user know which claim was in focus?
- Did the challenge round read as the main action?
- Did the user understand what kind of response to write?
- Did the user trust whether the round saved?
- Did the saved result feel worth the effort?
- Did any still-visible surface distract from the loop?
- What was the first moment of hesitation, confusion, or low trust?

## Observation Plan

The current MVP only needs enough observability to tell whether the loop is working or whether the user fought through it.

### Current Signals

- `challenge_started`
- `challenge_submission_attempted`
- `challenge_submission_failed`
- `challenge_completed`
- client-visible inline error state on failed challenge submission
- server-side logs and error monitoring already present in the repo

### What We Need To Know

- did the user start a round
- did they attempt submission
- did submission succeed
- did submission fail
- did they retry
- did they leave after completion
- where they hesitated or asked for confirmation

### Acceptable Early Sources

- manual observation
- self-test notes
- lightweight analytics events
- error logs
- short structured interview notes after one completed loop

## First-Test Script

Run the first real tests with minimal explanation.

1. Put the user in the canonical path.
2. Ask them to complete one challenge round.
3. Do not pre-explain every state.
4. Watch where they pause, hover, or ask whether something worked.
5. Note whether the saved and failed states were obvious.
6. Ask what felt unclear, unnecessary, or missing.
7. Sort every finding into the feedback buckets below.

## Feedback Buckets

Every observation after release goes into one of three buckets.

### Core-Loop Breakage

Use this when the user cannot complete or trust the main loop.

Examples:

- they cannot tell where to start
- they cannot tell which claim is in focus
- they cannot tell whether submission saved
- failure looks like success
- saved history does not reflect the completed round

### Usability Friction Inside The Loop

Use this when the loop works but the interaction still causes hesitation.

Examples:

- response copy is unclear
- the next action is technically available but visually weak
- saved state is visible but not prominent enough
- secondary context feels noisy even though it no longer blocks completion

### Good Ideas That Stay Parked

Use this when feedback asks for broader product richness that is not required to make the current loop usable.

Examples:

- richer dashboards
- broader graph tooling
- stronger learning mode
- additional synthesis layers
- more theory panels
- more retrieval surfaces

These do not re-enter the product by default. They return to `docs/mvp-parking-lot.md` unless evidence shows they are required for current-loop usability.

## Post-Release Rule

Do not respond to release anxiety by broadening the product.

After shipping:

- fix core-loop breakage first
- then fix usability friction inside the loop
- keep later ideas parked unless there is evidence that the current loop cannot succeed without them

## Acceptance Criteria For Part 5

- one user can complete the full loop with minimal guidance
- success and failure states are understandable
- saved state feels real and visible
- feedback is specific to the loop rather than to general product clutter
- the next set of changes can be prioritized from observed friction
- the hidden backlog remains intact and does not contaminate the shipped path
