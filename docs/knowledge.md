# Knowledge

## User-Provided Knowledge
- Read `AGENTS.md` at the start of each session and follow it unless the user explicitly overrides it.
- Use `/Users/bensuo/.codex/penny-shared-context.md` as the durable task artifact when it exists. Keep current-task state there, not in this file.
- Keep repo-visible changes small, path-limited, committed on `main`, and pushed to `origin/main` immediately after each coherent change.
- Challenge weak assumptions, ambiguous scope, and missing tradeoffs instead of accepting prompts or stale context at face value.
- Inspect the repo before coding, list files to be touched before coding, and use the existing package manager and stack where possible.
- Do not introduce unnecessary dependencies. After coding, provide how to test, quote exact errors, and do not claim success unless commands pass or unverified work is clearly labeled.

## Project Facts
- Project name: Penny.
- `docs/knowledge.md` is only for durable, reusable project knowledge.
- Task-specific goals, criteria, status, assumptions, and open questions belong in the shared context file; promote only stable repo facts or reusable operating rules into `docs/knowledge.md`.
- Shared context sections owned by the active role may be updated directly, but historical logs and unrelated role-owned sections should not be rewritten.
- The repo-local operating model favors small reversible changes and one-file commits when work moves across files.
- Backend rule: PostgreSQL is the source of truth; Supabase is infrastructure, not product logic.
- Backend rule: Brain, Challenge, and Learn are projections over the same workspace state, not separate sources of truth.
- Backend rule: all meaningful writes go through server-side command handlers and record domain events.
- Backend rule: AI outputs must be typed, validated, versioned, and logged before they affect core truth.
- Backend rule: stable IDs are mandatory for core entities: `userId`, `sphereId`, `mapId`, `claimId`, `conceptId`, and `roundId`.
- Backend rule: do not introduce microservices, a graph database as the primary store, separate core tables per mode, or core truth stored only in JSON blobs.
- Frontend rule: the frontend must not invent canonical workspace context, breadcrumb, mode identity, or backend-derived state.
- Durable project fact: request rate limiting should be centralized in a shared server helper so server actions and route handlers cannot bypass the same abuse guard.
- Durable project fact: export has an open JSON, Markdown, and CSV schema with a portability guarantee for user-owned data.
- Durable project fact: speed-critical AI workflow should keep local graph/ranking paths provider-free, give every provider-backed operation a latency class, context budget, timeout, and BrainRun speed metadata, and treat Gemini-style streaming or reasoning controls as provider-route details behind schema validation.
- Durable product fact: `docs/private-working-memory-engine-strategy.md` is the current strategy spec for Penny as a private working-memory engine. Connector, memory, retrieval, privacy, and training work should follow that spec while preserving the MVP guardrail against broad ingestion before the seed-to-challenge-to-learn-to-artifact loop works end to end.
- Durable deployment fact: dogfood/private-alpha deployments require strict env validation, safe structured logs, scoped Create export feedback capture, and Brain import size caps before use with real private material.

## Supermemory Understanding
- Last updated: 2026-04-27.
- Current MVP framing source: user instruction on 2026-04-27.

### Product Identity
- Penny is not a generic AI chat app. Penny is a controllable thinking instrument enhanced by AI.
- This project is about Penny / Supermemory: a pressure-tested second brain for people who need to turn half-formed thinking into rigorous, usable work.
- Penny captures how a user thinks, stress-tests that thinking against evidence and precedent, teaches concepts at the moment of confusion, and turns repeated interaction into self-knowledge about the user's cognitive patterns.
- Penny is not a note-taking app, chatbot, wiki, journaling tool, or general productivity system. It is a thinking instrument: a workbench where the user arrives with raw thought and leaves with something structurally sound.
- Core product sentence: "Penny is your second brain - you can stress-test any part of it, and you can learn anything you do not understand without leaving what you are doing."

### Primary Users
- Penny is for people whose work depends on making ambiguous thinking rigorous: founders in strategy pivots or high-stakes decisions, PhD students building literature reviews and dissertation arguments, first-time authors, policy analysts, people in major career or life transitions, engineers and technical founders, and students writing serious essays.
- Keep the positioning narrow. Penny loses its strongest users if it drifts toward casual notes, everyday journaling, quick factual Q&A, or generic productivity.

### Session Outputs
- Every meaningful Penny session must produce a result: a structurally sound artifact the user can use in real work, such as a founder brief, essay spine, decision memo, design review, policy brief, or personal clarity document.
- Every meaningful Penny session must produce learning: understanding gained at specific moments of confusion, usually through teach-back rather than passive explanation.
- Every meaningful Penny session must produce self-knowledge: updated shapes about how the user thinks, surfaced back to them in a way they can confirm, reject, or refine.
- If a completed session lacks a result, learning, or self-knowledge, something in the product flow failed.

### First MVP Loop
- User enters one raw idea.
- Penny extracts hidden assumptions.
- Penny creates a thought map.
- Penny shows useful exploration directions.
- Penny challenges the weakest part.
- User can Defend, Revise, or Absorb.
- Penny stores this as durable thinking history.
- User leaves with an Idea Map and Challenge Brief.

### Core Architecture
- Penny has one architectural noun and two specialized verbs.
- Brain is the product: the user's spatial, accumulating graph of claims, concepts, questions, moves, shapes, and spheres.
- Challenge / Verify is what the user does inside Brain when they focus on a claim or cluster and turn on stress-testing.
- Learn / Makes Cents is what the user invokes anywhere in Brain when they hit confusion and need a concept explained in context.
- Challenge and Learn are not separate products or destinations. They are modes of interaction with the same graph.

### Core Object Model
- Penny's conceptual reasoning primitives are Claim, Move, Shape, and Sphere.
- The MVP implementation vocabulary also includes Edge, Source, Session, Artifact, and WikiPage.
- Everything else should be a view, index, derivation, or compiled artifact built on top of these objects.

#### Claim
- A claim is a belief, assumption, question, or concept: something the user believes, is considering, is defining, or is confused about. Claims are graph nodes.
- Claims include content, type, status, provenance, user-assigned confidence, system-assigned confidence, optional resolution date, stakes tags, relationships, and sphere assignment.
- Claim type is one of claim, concept, or question.
- Claim status is exploratory, committed, or resolved.
- Provenance can include intuition, cited source, inherited belief, derived belief, or learned concept.
- User-assigned confidence is a 0-100 probability the user commits to.
- System-assigned confidence is Penny's propagated estimate based on graph structure.
- Stakes tags include reputation, money, time, relationship, self-image, and similar stakes.
- Relationships include supports, contradicts, depends-on, and refines.
- There are only three node visual types: claim, concept, and question. Evidence, assumptions, and counterarguments are relationships, not node types.

#### Move
- A move is an immutable, append-only, timestamped event. Every meaningful interaction generates moves.
- Moves include stress-tests and failure-type tags, critique outcomes, claim revisions and reasons, confidence changes and triggers, learning moments and teach-back outcomes, claim promotions/demotions/resolutions/abandonments/post-mortems, and session starts/ends/focus areas.
- Moves are the substrate of compounding. Any new feature must answer: what moves does it generate?

#### Shape
- A shape is a pattern derived from moves.
- Cognitive shapes include patterns such as "tends to argue from analogy," "under-specifies what success means," or "rates self-sourced evidence higher than external evidence."
- Domain shapes include patterns such as "under-stress-tests distribution," "strong on technical risk but weak on market timing," or "overconfident on market claims above 80%."
- Shapes are not personality blurbs. They are structured priors that alter future critiques, synthesis, and learning scaffolds.
- Shapes must be evidenced, dismissible, and updateable.

#### Sphere
- A sphere is a graph for a different part of the user's cognitive life.
- Default spheres are Work, Writing, Life, Learning, and custom project/domain spheres.
- Spheres exist because users will be more honest and prolific when sensitive personal claims are not mixed with startup strategy claims by default.
- Cross-sphere connections should be available on pull, such as "have I thought about this before?", but should not be pushed constantly.
- Learning concepts are the exception: they live in the Learning sphere but can be referenced from any other sphere.

#### Edge
- An edge is a typed relationship between claims.
- Edges carry structure such as supports, contradicts, depends-on, and refines. They are part of the source of current state rather than decorative graph lines.

#### Source
- A source is raw input, including the user's initial idea and any later material the user brings into the thinking loop.
- Sources are not polished truth. They are evidence and provenance for claims, moves, and artifacts.

#### Session
- A session is a bounded thinking loop with a start, work phase, end, and usable output.
- Sessions group moves, sources, artifacts, and shape updates so thinking history remains durable.

#### Artifact
- An artifact is the useful output from a session, such as an Idea Map, Challenge Brief, founder brief, essay spine, decision memo, or design review.
- Artifacts are outputs derived from claims, edges, and moves, not the canonical source of truth.

#### WikiPage
- A WikiPage is a compiled readable view.
- WikiPages are not source of truth; they should be regenerated or reconciled from claims, edges, and moves.

### Closed Loop
- The product must keep tightening this loop: user input -> challenge -> response -> memory -> updated critique -> better synthesis.
- Input should extract assumptions, ask for confidence, and tag stakes.
- Challenge should critique with failure-type tags, Bayesian propagation, and multi-framework retrieval.
- Response should let the user defend, revise, or absorb; override reasoning must be logged.
- Memory should log moves, compute shapes, and update the user's lens.
- Updated critique must visibly differ from generic generation because of the user's history.
- Better synthesis should produce structurally sound artifacts through gates scaled to stakes.
- The lens must update quickly enough that a meaningful override in one session visibly affects future generation within days. If users cannot feel the loop closing, the moat collapses.

### Challenge Mode
- Challenge is stress-testing inside Brain. The user selects a claim or cluster; Penny isolates the active region while keeping the broader graph visible in the periphery.
- The core dialectic is claim -> counterargument -> user response -> Penny evaluation/escalation/concession.
- Counterarguments can run multiple rounds. A claim's survival depth, or how many rounds it withstood, becomes part of the claim's structural health.
- Replace the generic text box with three explicit response paths: Defend, Revise, and Absorb.
- Defend means the user argues the critique is wrong or overweighted. It creates an override move with reasoning and becomes shape data.
- Revise means the user updates the claim. The old version is preserved in the old-selves timeline, and the new version inherits relevant stress-test history.
- Absorb means the user accepts the critique as a legitimate open risk without revising yet. The claim persists but carries the critique as an acknowledged vulnerability.

### Critique Transparency
- Every critique should expose strength rating: weak, moderate, or strong.
- Every critique should expose provenance: precedent-derived, structural-analysis-derived, shape-derived, or framework-derived.
- Every critique should explain why this critique was chosen, including failure type, active shape, precedent cases, and framework used.
- Every critique should show the causal chain: the actual reasoning, not just the conclusion.

### Failure-Type Taxonomy
- Critiques should be tagged because tags drive learning recommendations, precedent retrieval, and shape computation.
- Core tags: weak evidence, missing counterargument, shaky assumption, analogy break, dependency risk, unaddressed precedent, premise rejection, and definition failure.

### Stress-Testing Machinery
- Use multiple frameworks by default: game theory, network effects, operational, psychological, historical, political, technical, academic, and other relevant lenses.
- Avoid single-lens hedgehog critique.
- Optional named voices can help, such as skeptical investor, thesis committee, GTM operator, or academic reviewer, but they must be grounded in precedent, not vibes.
- When a user is breaking a norm, Penny should present the strongest case for the norm and require the user to address specifics rather than hand-wave with "I am doing something new."
- Before synthesis, Penny should run an adversarial final pass to identify the quiet keystone: the load-bearing claim whose failure would cascade through the rest of the graph.
- Counter-shape mode should periodically critique against the user's usual patterns to prevent personalization from becoming an echo chamber.

### Bayesian Propagation And Calibration
- The claim graph is a reasoning engine, not just visual organization.
- If claim A depends on claim B and B drops from 80% confidence to 40%, A cannot quietly remain at 80%. Penny should show the cascade and ask the user to accept the implication or defend why the dependency does not propagate. That defense becomes an override move.
- Every claim gets a confidence value at capture; the default can be 60%.
- Confidence above 90% triggers a soft challenge: what would need to be true to revise down to 70%?
- Resolved claims feed Brier tracking by domain.
- New evidence prompts incremental Bayesian updates rather than dramatic flips.
- Private self-bets can create emotional commitment without involving money.

### Stakes-Proportional Friction
- Low-stakes claims should move lightly. High-stakes claims require more before closure.
- Synthesis gates should scale with stakes: pre-mortem, double-barreled pre-mortem, if-you-were-right, twin-check, and dependency-completeness check.
- Pre-mortem means writing a short failure narrative imagining the plan went badly.
- Double-barreled pre-mortem also imagines not pursuing the plan was the mistake.
- If-you-were-right assumes the claim holds and asks what becomes possible and necessary soon.
- Twin-check means Penny restates the strongest version of the user's view and the user confirms whether it represents them.
- Dependency-completeness check warns about load-bearing claims that remain under-stress-tested.
- Post-mortems are first-class artifacts after claims resolve. They should capture what happened, what was right, what was wrong, and what shape data this creates.

### Learn Mode
- Learn is invoked when the user hits confusion. It is not a separate school mode; it is a context-preserving overlay inside live thinking.
- Inline Learn is a small explanation beside the triggering term. It should be minimal, contextual, and enough to unblock the user; roughly three sentences, then return to work.
- Full Learn is a deeper surface where a concept becomes a node in a local mini-graph with related concepts, examples, and teach-back.
- Full Learn defaults to teach-back: Penny gives a minimal one-sentence scaffold, the user explains the concept in the context of the active claim, Penny highlights gaps, the user revises, and understanding resolves after one or two iterations or disagreement becomes explicit.
- Learn outcomes: user got it right with a mastery marker, user struggled with a struggle marker and re-teaching later, or user disagreed and the user's preferred framing plus the disagreement becomes shape data.
- Concepts learned in context become Learning-sphere nodes connected to the claim that triggered them.
- Learning should track mastery, recurring gaps, and what concepts need re-scaffolding.

### Brain Surfaces
- Map is the spatial, aesthetic graph. It is the marketing screenshot and the place users go to see the topology of their thinking.
- Map should reward depth over sprawl: well-stress-tested claims have stronger visual weight, fresh claims look provisional, recently touched areas feel alive, and edges communicate dependency strength, support vs. contradiction, recency, and downstream impact.
- Fifty deeply examined claims should look better than ten thousand shallow ones.
- Map is not where most daily work happens.
- Stream is the practical daily surface: a reverse-chronological, claim-based feed of recent activity.
- Stream should show recent thinking, claims needing attention, aged foundations and decayed confidence, unresolved challenges, shapes that emerged or shifted, open questions worth returning to, and suggested next moves based on the current lens.
- Returning users should never face a blank state. Mid-challenge resumes the challenge; between sessions, Stream shows recommended next moves.

### Memory Made Visible
- The moves layer should not stay hidden. Users need to feel compounding.
- Important memory surfaces include old selves, belief genealogy, inheritance markers, contradiction cascade tracer, aging foundations monitor, weekly reflection, and shapes dashboard.
- Old selves means a timeline of claim content, confidence, and moves over time.
- Belief genealogy shows where a belief came from, what depends on it, and whether its source has been contradicted.
- Inheritance markers give inherited claims distinct treatment and additional scrutiny.
- Contradiction cascade tracer shows what else needs revisiting when a foundation changes.
- Aging foundations monitor aggressively reviews heavily depended-on claims and tracks confidence decay.
- Weekly reflection summarizes claims added, stress-tests run, concepts learned, shapes shifted, open loops, and one or two reflection prompts.
- Shapes dashboard is visible on demand and lets users confirm, reject, or refine shapes.

### Code-Upload Capability
- Code is a specialized parser for Brain, not a separate feature.
- When a user uploads code, Penny parses meaningful chunks into claims about design decisions rather than syntax descriptions.
- For each chunk, Penny should explain what it does, why it probably works this way, alternatives, tradeoffs, and second-order consequences.
- The artifact is a design-review document: what the code does, what decisions it embodies, which alternatives exist, which decisions are worth revisiting, and what constraints propagate downstream.
- The same mechanics apply: Challenge works on code decisions, Learn handles unfamiliar concepts, overrides become shape data, and everything composes back into Brain.

### Session Model
- Sessions are first-class units of cognitive work with a start, end, and rhythm.
- Lifecycle: start with the user declaring what they are working on, work in Brain/Challenge/Learn while Penny tracks moves and cognitive signals, then end with a summary of claims added, stress-tests run, concepts learned, open risks, shape changes, and a short reflection question.
- Default session length can be around 50 minutes, but natural breakpoints matter more than rigid timers.
- Penny should detect depletion signals such as shorter responses, thin override reasoning, or rapid acceptance of critiques. When depletion appears, Penny should suggest a clean stopping point.
- This anti-engagement stance is deliberate and builds trust.

### First-Session Experience
- The first session must reveal the architecture quickly without overwhelming.
- Ideal flow: user lands in an empty Brain, Penny asks what is on their mind, the answer becomes a seed claim, Penny extracts assumptions, Penny asks whether the user wants to stress-test it, Challenge begins on the seed region, a counterargument contains a clickable unfamiliar term, Inline Learn explains enough to unblock, and the session ends with a stress-tested initial claim plus a map of its structure.
- The first session needs real value, not a promise of future value.

### What Matters Most
- Penny fails unless it delivers immediate first-session value: assumption extraction, adversarial critique, and visible structure in the first hour.
- Penny fails unless it delivers genuine compounding over time: the lens actually changes based on moves, overrides, shapes, and resolved claims.
- Penny fails unless it delivers artifacts users actually use: each session produces something that helps in the user's real work.

### Architectural Moat
- Penny is non-wrappable only if five pieces are real: moves as substrate, override-as-signal pipeline, curated precedent corpus, Bayesian propagation, and shapes that alter generation.
- Moves as substrate means structured user history that generic LLMs do not have.
- Override-as-signal pipeline means disagreement becomes training data for that user's lens.
- Curated precedent corpus means structurally indexed failures, not scraped surface similarity.
- Bayesian propagation means confidence honesty through dependency structure.
- Shapes that alter generation mean future critique and synthesis visibly change because of the user's history.
- Without these, Penny is a polished wrapper. With them, it is a compounding cognition product.

### Precedent Corpus
- The precedent corpus should be editorially curated and structurally indexed.
- Each case should include name, claim-equivalent/core bet, load-bearing assumptions, what killed it, structural lesson, and failure-type tags.
- Retrieval should match on failure trajectory, not surface similarity. A grocery startup and pet-supply startup may fail from the same structure.
- Start with 100-200 high-quality structured cases in the domains target users care about, then grow through editorial work and optional reviewed user contributions.

### Community And Commons
- Community features should avoid social feeds and status games.
- Allowed directions include opt-in anonymized post-mortem contributions, aggregate open-question surfaces for researchers/journalists/funders, opt-in anonymized shape libraries for self-calibration, student mode and curriculum packs, and instructor surfaces only with student permission and focused on process rather than surveillance.

### Aesthetic And UX Principles
- Favor density over breadth, emergent structure over tagging ceremonies, progressive disclosure, Stream and Challenge for daily work, Map for zoom-out and aesthetic payoff, clean endings, no infinite engagement pull, cognitive state respect, protected deep work, bounded sessions over always-on presence, and distinctive visual design over generic AI app aesthetics.
- Avoid generic white-and-purple AI SaaS.
- Choose strong typography, a committed palette, meaningful motion, and visual depth.
- The interface should feel like a serious thinking instrument, not a productivity dashboard.

### MVP Product Rules
- No generic chatbot sidebar.
- The chat input is secondary. The structure is the product.
- Do not silently mutate truth.
- Meaningful changes create Moves.
- Current state is derived from claims, edges, and moves.
- Keep blast radius small; no giant rewrites.
- Keep files reasonably small.
- Prefer typed, validated AI outputs.
- Use xAI as the default AI provider.
- Use Claude only when explicitly useful for deeper critique or compilation.
- Prefer Postgres first.
- Do not add a graph database, product import flows, browser extension, MCP surface, or social features before the MVP loop works.

### Deliberate Exclusions
- Do not add points, badges, streaks, feeds, comments, likes, chatbot sidebar as the primary interaction, main-flow templates that replace emergent structure, engagement-driven notifications, AI-generated final prose as the default output, infinite scroll, or always-on Penny unless the product thesis changes.

### Project Reasoning Checklist
- Ask what Claim, Edge, Move, Shape, Source, Session, Artifact, WikiPage, or Sphere a feature creates or updates.
- Ask which part of the closed loop the feature strengthens.
- Ask what artifact the user leaves with.
- Ask whether the feature creates immediate value, compounding value, or both.
- Ask whether the feature improves structural rigor rather than generic convenience.
- Ask whether the feature preserves narrow positioning.
- Ask whether the feature respects bounded deep-work sessions.
- Ask whether the feature directly supports the first MVP loop before expanding scope.
- Ask whether a generic chatbot could copy the feature without the user's history. If yes, the feature is not core enough.
- Favor concrete product mechanics over vague AI language.
- Use the project's vocabulary: Brain, Challenge / Verify, Learn / Makes Cents, Claim, Edge, Move, Shape, Source, Session, Artifact, WikiPage, Sphere, lens, precedent corpus, assumption extraction, defend/revise/absorb, quiet keystone, synthesis gates, Idea Map, Challenge Brief, and old selves.

### Critic MVP Checklist
- Verdict must be `Accept` or `Reject`; reject if the wave makes Penny feel like generic chat, a pretty note app, a memory wrapper, a graph toy, or fake reasoning.
- Product fit: does the change strengthen the first loop from raw idea to assumptions, thought map, exploration directions, weakest-part challenge, Defend/Revise/Absorb, durable history, Idea Map, and Challenge Brief?
- Epistemic integrity: are claims, assumptions, confidence, critique provenance, uncertainty, and user overrides explicit rather than silently rewritten?
- Data model correctness: are current views derived from Claims, Edges, and Moves, with Artifacts and WikiPages treated as compiled outputs rather than truth?
- Move capture: does every meaningful user/system state change create or require a Move, especially challenge responses, revisions, confidence changes, and accepted risks?
- Small blast radius: is the change path-limited, typed, validated, and free of premature graph DB, import surface, browser extension, MCP, social, or generic assistant scope?
- UI distinctiveness: does the interface foreground structure, map, challenge, and artifacts instead of a chatbot sidebar or decorative graph-only experience?
- Testability: can the wave be verified with focused tests or static checks that prove schema validation, move creation, first-session value, and failure behavior?
- First-session value: can a new user leave the first session with a useful Idea Map plus Challenge Brief, not just a promise of future memory?
- Required review output: list top 3 issues, required fixes before the next wave, nice-to-haves to defer, and wrapper risk from 1 to 10.

## Retrieval Hints
- Search this file, the shared context file, and nearby repo docs with `rg` before broader search.
- Label each note by source when useful: `user`, `repo`, or `external`.
