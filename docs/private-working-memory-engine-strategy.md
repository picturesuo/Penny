# Private Working-Memory Engine Strategy

Status: Product / strategy spec
Date: 2026-05-08
Scope: long-term Penny product direction, connector memory posture, retrieval principles, and privacy/training stance

## Core Thesis

Penny is a private working-memory engine for founders and highly creative people.

The product gives users more of their own working memory. It pulls ideas, questions, people, deadlines, patterns, prior conversations, and unfinished thoughts back into the user's present work so new thinking stems from the user's own previous thinking, not generic chatbot guesses.

Do not pitch Penny as "AI uses your private data." Pitch:

> Penny is a thinking graph that turns scattered context into sharper ideas, checks, learning loops, and creative momentum.

The product should feel like a controllable thinking instrument, not a generic chatbot, note app, or data-ingestion wrapper. Memory is only valuable when it changes the quality of the user's current thinking and remains traceable, correctable, and user-owned.

## Product Identity

Penny's durable identity:

- Brain is the persistent thinking graph where the user's ideas, claims, projects, assumptions, artifacts, questions, people, decisions, and lessons become linked working context.
- Check / Challenge / Verify turns graph context into sharper critique by finding weak claims, contradictions, stale assumptions, missing evidence, and idea-risk blind spots.
- Learn / Makes Cents turns graph context into active recall, spaced review, project-specific lessons, teach-back prompts, and creative drills.
- Connectors feed the graph selectively. They do not create a blind warehouse of private data.
- Retrieval returns the smallest useful set of memory shards and evidence pointers needed for the current work.

The core loop remains:

1. The user starts from a seed idea, question, claim, project, or artifact.
2. Penny retrieves relevant prior thinking and source pointers.
3. Penny extracts or updates graph structure: assumptions, dependencies, contradictions, questions, concepts, people, decisions, and deadlines.
4. Penny challenges weak or stale parts of the graph.
5. The user Defends, Revises, or Absorbs.
6. Penny creates Moves and updates memory, learning, and artifacts.
7. The user leaves with a usable Idea Map, Challenge Brief, lesson, decision memo, or creative artifact.

## Product Modules

### 1. Brain

Brain is the persistent thinking space.

Brain nodes represent:

- ideas
- claims
- projects
- assumptions
- artifacts
- questions
- people
- decisions
- concepts
- memory shards
- source digests

Brain edges represent:

- depends_on
- supports
- contradicts
- challenges
- refines
- teaches
- mentions
- belongs_to_project
- involves_person
- has_deadline
- derived_from

Brain must remain the source of structure. The frontend can render graph slices, but it must not invent canonical graph edges.

### 2. ChatGPT Import

ChatGPT import lets the user upload or export/import past ChatGPT conversations.

The goal is not transcript search. The goal is to extract reusable thinking material:

- reusable thoughts
- abandoned ideas
- recurring questions
- stated preferences
- writing style signals
- decision patterns
- founder or creative taste
- projects that kept resurfacing
- claims that were never resolved
- concepts the user repeatedly asked to understand

Default output should be suggested MemoryShards, ClaimSuggestions, ShapeSuggestions, SourceDigests, and EvidencePointers. Raw snippets should be stored only when necessary for provenance and visible to the user.

### 3. Gmail Selective Memory

Gmail memory must be selective by design.

Users choose the import boundary through:

- labels
- senders
- threads
- date ranges
- Gmail search queries
- explicit project scopes

Avoid blind full-inbox ingestion. Gmail should extract only memory shards, source pointers, relationships, summaries, people, deadlines, and project context that help the active thinking graph.

Gmail outputs should preserve provenance without making Penny feel like it is reading everything. Every surfaced memory should answer "why Penny thinks this" with source class, scope, confidence, and editable evidence.

### 4. Calendar

Calendar is high-signal and low-content.

Use:

- meeting metadata
- recurring events
- project timelines
- deadlines
- time allocation
- meeting participants
- cadence changes

Avoid turning calendar into a transcript or surveillance surface. Calendar should primarily strengthen temporal context, project awareness, deadline recall, and review cadence.

### 5. Check System

Check challenges the graph.

It should find:

- weak claims
- contradictions
- stale assumptions
- shallow reasoning
- missing evidence
- idea-risk blind spots
- unsupported high-confidence claims
- heavily depended-on foundation claims that need review

Check should use connector memory only when it is relevant and traceable. A challenge should say whether it is grounded in prior ChatGPT threads, selected emails, calendar patterns, source uploads, graph structure, shapes, or user-authored moves.

### 6. Learn System

Learn turns Brain nodes into active learning loops.

It should create:

- active recall cards
- spaced review prompts
- project-specific lessons
- teach-me-back prompts
- creative drills
- concept nodes connected by teaches edges
- lesson history tied to the active project or claim

Learn should use the user's own prior thinking as context, while avoiding echo-chamber personalization. When the user's pattern is likely causing a blind spot, Learn can use counter-shape prompts that ask the user to explain the neglected frame.

### 7. Graph

Every memory, claim, artifact, and check links to Brain nodes with:

- provenance
- confidence
- decay
- recency
- source class
- source scope
- accepted/rejected status when user-reviewed

The graph is not just visual organization. It is the retrieval, critique, learning, artifact, and provenance substrate.

## Memory Object Model

These objects define connector-derived memory without making raw private data the product center.

| Object | Purpose |
| --- | --- |
| `ConnectorAccount` | User-authorized connection to a provider such as ChatGPT export, Gmail, Calendar, Slack, Canvas, Upload, or Instagram/export. |
| `ContextSource` | A bounded user-approved source scope, such as a ChatGPT archive, Gmail label, selected thread, calendar date range, uploaded file, or Slack channel/date window. |
| `ContextChunk` | A bounded source fragment used for extraction, with source pointer, source class, retention policy, and visibility controls. |
| `MemoryShard` | A compact reusable memory derived from a chunk, such as a preference, recurring idea, unresolved question, project fact, person note, deadline, or decision pattern. |
| `ClaimSuggestion` | A candidate claim, assumption, question, concept, counterargument, or decision to add to Brain after user approval. |
| `ShapeSuggestion` | A candidate pattern in the user's thinking, writing, decision-making, or creative taste, backed by evidence and dismissible by the user. |
| `EvidencePointer` | A pointer to evidence without necessarily storing raw content, including source class, source ID, excerpt availability, confidence, and recency. |
| `SourceDigest` | A summary of a source scope, such as a Gmail thread set, ChatGPT conversation cluster, meeting series, or uploaded artifact. |
| `ConnectorAuditEvent` | Append-only event for connector authorization, import scope selection, extraction, user review, deletion, and retention changes. |
| `BrainNode` | Canonical graph node for ideas, claims, projects, assumptions, artifacts, questions, people, decisions, concepts, memory shards, or source digests. |
| `BrainEdge` | Canonical relationship between Brain nodes with provenance, confidence, recency, and source class. |
| `CheckResult` | A challenge, contradiction, stale-assumption warning, evidence gap, or risk finding tied to graph nodes and source pointers. |
| `LearnCard` | Active recall, teach-back, spaced review, or creative drill item connected to concepts, claims, projects, and source memory. |
| `DecaySignal` | A signal that memory, assumptions, evidence, or confidence should be reviewed because of age, contradiction, or changed project context. |
| `ConsentRecord` | User decision about connector access, storage, derived memory, training controls, deletion, retention, and fine-tuning scope. |

These objects should create Moves when they meaningfully affect the graph, review state, connector state, or user-visible memory.

## Privacy And UX Posture

Penny may store connector-derived context, but it must be explicit, controllable, and useful to the user.

Default posture:

- Store raw snippets only where necessary and user-visible.
- Prefer derived MemoryShards, SourceDigests, EvidencePointers, SourceSpans, and provenance over raw content.
- Label every memory by source class: ChatGPT, Gmail, Calendar, Slack, Canvas, Upload, or Instagram/export.
- Let users approve, edit, reject, merge, or archive suggested memories.
- Let users delete connector data.
- Let users delete derived memory.
- Show why Penny thinks something: source class, source scope, evidence pointer, confidence, age, and graph relationship.
- Keep connector audit history visible enough for trust and support.
- Treat sensitive spheres and projects as separate by default unless the user explicitly pulls cross-sphere context.

The design requirement is "magical but not creepy." Magical means Penny remembers the right unfinished thought at the right moment. Not creepy means the user can see, correct, narrow, or delete the memory trail that produced it.

## Training Posture

Use user-benefiting personalization only.

Principles:

- Separate private memory from shared model training.
- Personal users may choose whether their content improves shared models.
- Business and team data should default to no shared training.
- Fine-tuning must be explicit, private, revocable, and scoped.
- Position fine-tuning as "train Penny to think with me," not "sell my data."
- Keep connector-derived memory available to product personalization only within the user's consent and retention settings.
- Record consent changes in ConsentRecord and ConnectorAuditEvent.

Training controls should be understandable at the product level, not hidden in legal copy.

## Connector Roadmap

Build toward these modules together as the long-term product architecture:

1. Brain
2. ChatGPT import
3. Gmail selective import
4. Calendar context
5. Check
6. Learn
7. Graph

Roadmap order:

- Now: keep the first Penny loop undeniable: seed idea, assumptions, thought map, exploration, challenge, Defend/Revise/Absorb, Learn, Idea Map, and Challenge Brief.
- Next: add connector-shaped data objects and local validation without broad ingestion UI.
- Next: add ChatGPT export/import as the first high-value private-memory source.
- Next: add Gmail selective memory with labels, senders, threads, date ranges, and queries.
- Next: add Calendar metadata for deadlines, recurring context, project timelines, and time allocation.
- Later: add Slack selective channel/date import for founder teams.
- Later: add Canvas as a student/creator-learning wedge.
- Later: add Instagram through manual export or creator analytics first, not broad personal feed scraping.

This roadmap does not override the MVP guardrail against broad ingestion before the seed-to-challenge-to-learn-to-artifact loop works end to end. It defines the product direction and object model Penny should grow toward.

## Retrieval Model

Do not search raw everything.

Retrieve across strata:

- source type
- source scope
- time
- domain
- confidence
- novelty
- semantic relevance
- lexical relevance
- graph distance
- active project
- active sphere
- recency
- decay state
- user-reviewed status

Retrieval should return the smallest useful set of shards, source digests, evidence pointers, and graph neighbors for the current work.

Penny should state memory strength in plain language:

> This is medium confidence from 3 old emails and 2 ChatGPT threads.

Weak-evidence behavior:

- Say when memory is old, narrow, unreviewed, or inferred.
- Prefer "I have weak evidence for this" over confident personalization.
- Ask the user to confirm or reject uncertain memory.
- Do not let private memory become an opaque authority.

## Output Traceability

Every personalized output should be inspectable.

For any claim, challenge, lesson, artifact, or suggestion, Penny should be able to show:

- Which Brain nodes were used.
- Which memory shards were used.
- Which source class each shard came from.
- Which EvidencePointers or SourceSpans are available.
- Whether raw snippets are stored.
- Whether the memory was user-approved, edited, rejected, or inferred.
- How old the evidence is.
- Why the retrieval set was considered relevant.
- What the user can correct.

The user should never have to wonder whether Penny invented private context.

## Positioning Language

Use:

- "Penny gives you more of your own working memory."
- "Penny turns scattered context into sharper ideas, checks, learning loops, and creative momentum."
- "Penny helps new thinking stem from your previous thinking."
- "Penny is a thinking graph for founders and creative people."
- "Penny can show why it thinks something and lets you correct it."

Avoid:

- "AI uses your private data."
- "Chat with all your apps."
- "Search everything."
- "Second brain that remembers everything."
- "Autonomous agent for your inbox."
- "Universal data ingestion."

## Product Acceptance Checklist

A connector or memory feature belongs in Penny only if it satisfies all of these:

- It strengthens Brain, Check, Learn, or the artifact loop.
- It creates or updates explicit graph objects rather than hidden prompt context.
- It stores raw snippets only when necessary and user-visible.
- It labels source class and source scope.
- It supports approve, edit, reject, and delete.
- It can explain "why Penny thinks this."
- It records meaningful changes as Moves or audit events.
- It avoids broad ingestion unless the user selected a bounded scope.
- It improves current thinking with the user's own history rather than generic personalization.
- It keeps Penny out of generic chatbot-sidebar territory.
