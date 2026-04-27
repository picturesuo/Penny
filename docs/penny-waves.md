# Penny MVP Waves

Build Penny in small waves. Each wave should preserve the rule that meaningful changes create Moves and current state is derived from claims, edges, and moves.

## Wave 0: Reconnaissance

- Inspect the active repo and current dirty state.
- Identify existing stack, contracts, tests, and constraints.
- Do not code product behavior.

## Wave 1: Context And Contracts

- Keep concise product context in `docs/penny-mvp.md`.
- Lock the seed output contract for raw idea, assumptions, thought map, exploration paths, first challenge, Moves, and artifacts.
- Keep AI output typed and validated with Zod.

## Wave 2: Persistence

- Add the smallest Postgres-backed schema for Source, Session, Claim, Edge, Move, and Artifact.
- Store raw input as Source, not as polished truth.
- Store every meaningful change as an immutable Move.

## Wave 3: Seed API

- Add `POST /brain/seed`.
- Accept one raw idea.
- Return a persisted Idea Map and Challenge Brief projection.
- Reject invalid AI output without creating partial durable state.

## Wave 4: Thinking Cockpit

- Build the minimal three-panel UI:
  - left: Thought Map / Later / Quick Select
  - center: Current Exploration / structured rows / command input
  - right: Penny Insight / Makes Cents
- Keep the command input secondary to the evolving structure.

## Wave 5: Challenge Response

- Add Defend, Revise, and Absorb.
- Defend creates an override Move.
- Revise preserves old claim history and creates a revised claim state.
- Absorb records an acknowledged vulnerability.

## Wave 6: Learn And Finish

- Add contextual Learn / Makes Cents for one confusing concept.
- End the session with an Idea Map and Challenge Brief artifact.
- Keep WikiPage compilation and source-backed Verify out of scope.

## Do Not Build Before MVP

- Generic chatbot sidebar.
- Graph database.
- Broad imports, browser extension, MCP, or social features.
- Full wiki compiler.
- Source-backed web verification.
- Shapes dashboard or long-term personalization surfaces.
- Multi-user collaboration, billing, or auth beyond what is needed to run the loop.
