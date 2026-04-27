# Penny MVP

Penny is a controllable thinking instrument enhanced by AI, not a generic chatbot. The product is the evolving structure around the user's idea; the chat input is only one way to issue commands.

## First Loop

1. User enters one raw idea.
2. Penny extracts hidden assumptions.
3. Penny creates a thought map.
4. Penny shows useful exploration directions.
5. Penny challenges the weakest part.
6. User can Defend, Revise, or Absorb.
7. Penny stores the loop as durable thinking history.
8. User leaves with an Idea Map and Challenge Brief.

## Modes

- Brain: the spatial, accumulating graph of the user's thinking.
- Challenge / Verify: stress-tests claims and exposes weak assumptions.
- Learn / Makes Cents: explains concepts in context at the moment of confusion.

Challenge and Learn are modes inside Brain, not separate products or sidebars.
The first loop can include Learn only when confusion appears; it should not become a separate Learn app or delay the core challenge loop.

## Core Objects

- Claim: stable identity for a belief, assumption, question, counterargument, or concept.
- ClaimVersion: claim content, confidence, status, validity, and current/old state.
- ClaimEdge: a typed relationship between claims.
- Move: an immutable, append-only thinking event.
- BrainRun: one AI operation against the thinking graph.
- Shape: an inferred pattern in how the user thinks.
- Source: the one raw idea entered for the MVP loop. Documents, chats, and web sources are post-MVP source types.
- SourceSpan: provenance for claim content and AI-derived structure.
- Session: one bounded thinking loop.
- Artifact: useful output from a session.
- WikiPage: a compiled readable view, not source of truth.

## Product Rules

- No generic chatbot sidebar.
- Meaningful changes create Moves; Moves are immutable and append-only.
- Every AI operation creates a BrainRun.
- Current state is derived from claims, claim versions, edges, and moves.
- Assumptions are claims connected by depends_on edges.
- Counterarguments are claims connected by contradicts/challenges edges.
- Learn concepts are claims of kind=concept connected by teaches edges.
- Backend returns graph slices; frontend does not invent graph edges.
- AI output uses provider-safe schemas plus strict local validation before it can affect product state.
- Keep the MVP narrow until the first loop works end to end.

## Not Before MVP

Do not build graph databases, broad imports, browser extensions, MCP, social features, full wiki compilation, source-backed web verification, or a shapes dashboard before the MVP loop works.
