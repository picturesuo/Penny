# Penny

Penny is a pressure-tested second brain. It captures how its user thinks, stress-tests that thinking against evidence and precedent, teaches the user what they do not understand at the moment they need it, and surfaces patterns in their cognition back to them. The output is threefold: a structured artifact, durable learning, and self-knowledge about how the user thinks.

Penny is not a note-taking app, a chatbot, a wiki, or a journaling tool. It is a thinking instrument: a workbench you sit down at with raw thought and leave with something structurally sound.

## Brain / Challenge / Learn

- `Brain` is the product: a spatial, accumulating knowledge graph of the user's thinking over time.
- `Challenge` is what happens when the user focuses on a region of Brain and turns on stress-testing.
- `Learn` is what happens anywhere in Brain when the user hits confusion and needs to understand something before moving on.
- Challenge and Learn are modes of interaction with the same graph, not separate products.

## Target Users

Penny is for people whose work is taking half-formed thinking and making it rigorous:

- Founders mid-strategy pivot
- PhD students doing literature reviews and dissertation arguments
- First-time authors trying to make a book-length argument hold together
- Policy analysts preparing briefs that will be attacked by opposing views
- People in career transitions figuring out what they actually believe
- People post-quitting-a-big-thing who need their own cognition before they take more advice
- Engineers and technical founders interrogating their own design choices
- Students writing serious essays who want structure before prose

Penny is explicitly not for casual note-taking, everyday journaling, quick factual questions, or general productivity.

## Outputs

Every session should leave the user with three things:

- A result: a structurally sound artifact such as a brief, outline, memo, plan, or spine document.
- Learning: understanding gained at the exact point of confusion, not a reading list.
- Self-knowledge: visible patterns in how the user thinks, captured as shapes and old selves.

## Core Architecture

- `Claim`: the node substrate. A claim is an assertion, concept, or question with content, provenance, status, confidence, stakes, dependencies, and sphere assignment.
- `Move`: the event substrate. Every stress-test, override, revision, learning moment, confidence change, resolution, abandonment, session start, and session end becomes an immutable move.
- `Shape`: the pattern substrate. Shapes are recurring cognitive or domain patterns derived from moves and surfaced back to the user.
- `Lens`: the live model of the user. It is derived from high-confidence shapes and is injected into generation so Penny's critique actually changes over time.
- `Sphere`: a contextual graph boundary so work, writing, life, and learning can remain distinct while still allowing pull-based cross-sphere connection.
- `Session`: a first-class unit of cognitive work with a start, an end, a rhythm, and a protected focus window.

Capture is intentionally broad:

- Upload diagrams or images and turn them into claims with the visual artifact attached as evidence.
- Record voice memos and parse them into claim-structure candidates for confirmation.
- Import highlights from reading so claims or evidence preserve provenance and citation.
- Process meeting transcripts into decisions, claims, disagreements, and action items.

## Brain

Brain has two primary views of the same data:

- The Map: a spatial, zoomable knowledge graph for topology, structural health, and aesthetic payoff.
- The Stream: a reverse-chronological feed for what the user was just doing, what has aged, what needs attention, and what the next move is.

The Map is where the structure becomes visible. The Stream is where daily work starts.

## Margin

Margin is the low-friction capture lane for fleeting thoughts that should stay alive without interrupting the current thread.

- Press Tab to stash a fragment in under three seconds.
- Fragments stay separate from claims until the user promotes, merges, or archives them.
- Penny resurfaces fragments when they match the current context, cluster with other fragments, or age into a weekly review.

## Challenge

Challenge is the dialectic interaction: claim, counterargument, response, repeated in explicit rounds.

- Counterarguments should have explicit rounds, strength labels, provenance tags, and a why-this-critique panel.
- The user should be able to defend, revise, or absorb a critique.
- Penny should show the quiet keystone: the load-bearing claim whose failure collapses the rest of the structure.
- Penny should also surface quiet fragility when felt confidence outruns structural support.
- Stress tests should draw from multiple critique frames rather than one generic voice.

## Collaboration

Penny supports bounded collaboration without turning into a social feed.

- Specific audience critique lets the user tune a claim to a concrete audience, such as a board, advisor, or co-thinker.
- Advisor review mode keeps critique-only contributions separate from claim editing.
- Shared spheres keep authorship visible when two people want to think together on one problem.
- Thought-partner matching stays one-to-one, opt-in, and time-limited to structurally similar questions.

## Learn

Learn should be just-in-time and claim-anchored.

- Penny gives a minimum scaffold, then asks the user to explain the concept in the context of the current claim.
- Penny highlights the gap in the user's own explanation and asks for a corrected restatement.
- If the user is missing a prerequisite concept, Penny should zoom out and teach that concept first through a prerequisite graph.
- Learned concepts should come back contextually when they naturally apply, not just as flashcards.
- Users should also be able to enter a dedicated learning mode when the goal is conceptual expansion rather than claim work.
- Penny should keep a personal concept glossary with mastered concepts organized by domain and linked back to the claims where they first appeared.
- If a learned concept collides with an existing claim, Penny should surface that tension and force the propagation into the map.
- Research-mode expansion should stay optional and separate from the inline learning moment.
- The system should remember what the user has mastered, what they keep needing to relearn, and where their understanding still fails.

## Sessions and Synthesis

- Sessions should have explicit exit criteria and a clean ending.
- Capture, structure, stress-test, synthesize, and reflect should each feel completable.
- Synthesis should be gated by pre-mortem, if-you-were-right, twin-check, stakes-proportional friction, and dependency-completeness review.
- Synthesis should also track artifact versions and drift so later drafts can be checked against the claims they rest on.
- Domain templates should stay structural: founder brief, essay spine, research proposal, policy memo, product spec, design review, investment thesis, and career-transition framework all need different gates.
- Multi-output synthesis should let one claim base produce multiple artifacts for different audiences without losing structural consistency.
- The output should visually reflect confidence propagation so weak or unexamined claims are marked inside the artifact itself.
- Penny should optionally generate a counter-version artifact so the user can inspect the strongest opposite case before committing.
- Session start should optionally capture mood and state: fresh, tired, defensive, or curious, so Penny can adapt critique honestly to the user’s actual mode.
- Penny should track response latency, response length, and specificity during a session and warn when the user is getting tired.
- Break prompts should appear at natural breakpoints so the product supports incubation instead of forcing continuous critique.
- When the user returns to a session after a break or after time away, Penny should restore context: where they left off, what they were working on, what was open, and what aged while they were gone.
- Calendar awareness should let Penny recommend work that fits the uninterrupted time the user actually has.
- Decision deadline tracking should escalate pressure as resolution dates approach.
- Commitment tracking should record whether the actions implied by if-you-were-right mode actually happened.
- The product should protect deep work, detect depletion, and suggest stopping when it has enough signal.
- Reflection after synthesis should be optional but rewarded.

## Calibration and Memory

- Every claim should have a confidence value.
- Confidence above 90% should trigger a soft challenge.
- Resolved claims should feed Brier tracking and private self-bets.
- Old selves, belief genealogy, inheritance markers, contradiction cascades, confidence drift, and aging foundations should all be visible.
- Shapes should be visible, reviewable, and capable of changing the lens quickly enough that the next critique feels different.

## Trust and Control

- Penny should periodically self-audit to check where it has been too lenient, too harsh, or miscalibrated.
- Users should be able to export their full Brain at any time, including claims, moves, shapes, artifacts, and learnings, in structured form.
- Penny should import from Roam, Obsidian, Notion, and Google Docs by parsing existing notes into claim-candidates for user confirmation.
- Claims should support privacy tiers so extra-private material never enters aggregate shape libraries or community features unless the user explicitly allows it.
- Users should be able to archive and hide things they truly want to forget without deleting historical integrity from the system.
- Advanced users should be able to write custom lens rules, such as weighting technical claims harder than market claims or suppressing a redundant school of thought.
- Users should be able to inspect and edit shapes directly when Penny’s model of them is wrong.
- Lens reset should let the user ask Penny to rebuild from recent moves when major life changes invalidate older patterns.
- Reasoning replay should let the user trace the full move history behind a decision or artifact.
- Citation capture should attach source provenance to pasted material so claims can be traced back through source, search, and session.
- Source reliability should default to stronger weighting for peer-reviewed research than for interviews, tweets, or intuition.
- Penny should flag when cited sources contradict each other or when a source has been updated, retracted, or contradicted by newer evidence.

## Predictive Surfaces

- Penny should simulate likely, keystone-corrected, and failure trajectories based on the current claim structure and shapes.
- Penny should surface reasoning archetypes over time so the user can see which thinker they most resemble, without turning it into flattery.
- Users should be able to ask what a specific hero thinker would think, grounded in that thinker’s actual published work.
- Penny should map structural absences in the user’s thinking, not just the present nodes.
- Advanced users should be able to compare their actual reasoning to a generated thinking twin built from their shapes.

## Curriculum and Education

- Student mode should apply the tunnel to essay writing: capture claims, stress-test structure, teach through confusion, synthesize an outline, then hand off prose to downstream AI.
- Instructor surface should let teachers inspect the structural progression of student thinking with permission.
- Classroom shape views should show aggregate bottlenecks.
- Curriculum packs should be tuned tunnel variants with task-specific exit criteria, not just content templates.
- Literature review mode should specialize paper import, abstract claim extraction, and field-level synthesis for PhD work.
- Pitch deck mode should frame the work around slide clusters like problem, solution, market, traction, team, and ask.
- Book proposal mode should frame the work around hook, thesis, chapter arguments, and market positioning.
- Career decision mode should calibrate gates to life decisions, especially values, identity, and what-if-wrong questions.

## Design Principles

- Density over breadth: deeper maps should look and feel better than shallow ones.
- Emergent structure: organization should accrete from work, not from upfront tagging ceremonies.
- Progressive disclosure: the active stage should stay front and center.
- Knowledge cards first: single claims should be the primary working surface, with the graph as a minimap.
- Outline first: the daily workspace should favor structured work over decorative overview.
- Smart defaults: Penny should preselect the right critique depth and learning scaffold, but always allow override.
- Clean endings: finished work should feel finished.

## What Penny Does Not Do

- No points, badges, or streaks
- No feed, comments, or likes
- No chatbot sidebar as the core interface
- No template-first main flow
- No engagement-driven notifications
- No default final prose generation
- No infinite scroll
- No always-on background assistant

What the user should leave with:

- A structured result, such as a brief, outline, decision memo, or plan.
- Real learning, anchored to the exact weak point that surfaced.
- Self-knowledge, expressed as visible patterns in how they think.

The underlying product bet is psychology-backed:

- Teach-back should be the default learning interaction.
- Desirable difficulties should be used where they improve durable understanding.
- Metacognition should be visible and measurable, not hidden.
- Confidence decay and revisitation should keep beliefs current.
- Calibration should improve over time, not just perceived speed.
- The most important flagship addition is an old selves view that shows past beliefs and confidence levels over time, turning the moves layer into something users can feel and share.
- Decision synthesis should be load-bearing too: pre-mortems, if-you-were-right mode, stakes-proportional friction, twin-check output, and post-mortems should make the output step feel real, not generic.

The design aim is an invested sparring partner, not a sycophantic assistant and not a brutal critic.

## Psychology Layer

Penny’s psychology model is intended to make the product genuinely non-wrappable:

- Claims hold beliefs, provenance, confidence, and relationships.
- Moves record every critique, override, revision, learning moment, and revisit.
- Shapes derive recurring patterns in the user’s thinking.
- The lens turns those shapes into live context for generation.

The loop should close fast enough to feel real:

1. Penny generates a critique or learning prompt using the lens.
2. The user responds, overrides, revises, or learns.
3. That response becomes a move.
4. Moves update shapes.
5. Shapes update the lens.
6. The next interaction is meaningfully different.

The goal is not friction for its own sake. The goal is to preserve the effort that makes thinking durable while removing avoidable UI friction.

Friction should scale with stakes so the product does not flatten important decisions into lightweight ones.

### Loop Tightening

- Lens injection pipeline: every stress-test, learning moment, and precedent retrieval should receive a structured slice of the lens, not just a personality summary.
- Lens freshness monitoring: track the lag between a move and the generation behavior it changes, with a target of under a week.
- Internal lens A/B: compare generic critique with lens-informed critique and verify that the difference is visible to a third party.
- Shape confidence thresholds: only shapes above threshold should feed the lens; provisional shapes stay tracked but inactive.
- Override-derived shapes: disagreement data should produce its own shape signals, separate from behavior-derived patterns.

### Memory & Time

- Old selves expansion: show confidence deltas over time, active shapes at the moment a claim was made, and what precedent Penny would have shown then versus now.
- Belief genealogy: trace where a belief came from, what depends on it, and whether its source has been contradicted since.
- Inheritance markers: explicitly tag claims received from someone else and raise default scrutiny on that source chain.
- Contradiction cascade tracing: when a foundational claim changes, show which downstream claims need revisiting.
- Cross-project shape transfer: let shapes learned in one project inform stress-testing in the next.
- Session rhythm memory: when the user returns after time away, show what aged, what’s still believed, and where they left off.
- Old selves per node: show content, confidence, and moves over time so the moves architecture becomes felt experience.
- Confidence drift indicators: surface recent confidence shifts directly on the graph.
- Contradiction cascade preview: when a claim is revised, show the downstream debt before the user commits.
- Provenance tracing: show the original source, capture session, and shapes present when the belief formed.
- Inherited-claim markers: render inherited claims distinctly and give them automatic extra scrutiny.
- Time-lapse of the map: let users watch claims appear, relationships form, stress-tests resolve, and shapes emerge over weeks and months.
- Seasonal views: snapshot the map by month, quarter, or year so users can compare me-then to me-now structurally.
- Shape evolution: show when each shape was first detected, how its confidence changed, and which moves strengthened or weakened it.
- Sphere-level health: gently indicate whether each sphere is active, dormant, or full of unresolved questions.
- Dead zones: surface long-ignored clusters so the graph does not quietly accrete cruft.

### Calibration

- Probability commitment: every claim should have a confidence value at capture time, and very high confidence should trigger a soft challenge.
- Brier trajectory: the product should show whether the user is getting sharper over time, not just whether the tool feels useful.
- Domain-partitioned feedback: calibration should be visible by domain so the user can see where their 80%s land reliably and where they do not.
- Private self-bets: users should be able to stake credibility points against themselves on time-bound claims.
- Bayesian update prompts: new evidence should nudge confidence in small increments instead of letting the user swing wildly.

## Psychology-Backed Design

The product should reflect research-backed learning and judgment principles:

- Self-explanation as the core learning mechanism.
- Teach-back over summary.
- Spacing, interleaving, variation, retrieval practice, and generation as desirable difficulties.
- Metacognition surfaced as local confidence and global thinking patterns.
- Calibration tracked over time, including confidence versus outcome.
- Confidence decay for stale beliefs.
- Multi-framework stress-testing instead of one generic critique voice.
- Post-mortems on resolved claims as a first-class artifact.
- Cognitive protection during deep work, so the product does not create unnecessary load.

The visual and interaction model should feel like a built city, not a notes dump:

- Structure should emerge from thinking.
- Density should beat breadth.
- The graph should remain a lens, not the product.
- Best next move should remain the central decision surface.
- The tunnel should feel complete at the end of a traversal, not like an endless loop of prompts.
- Curriculum modes should feel like tuned tunnels, not generic templates.

## Interface & Aesthetic

- Density over breadth: well-stress-tested nodes should look richer and more confident, while shallow nodes stay thin and provisional.
- Emergent structure: avoid upfront tagging; let organization accrete from stress-testing and relationship inference.
- Progressive disclosure: keep the active stage front and center and keep other stages accessible but quiet.
- Knowledge cards first: make the selected claim the primary working surface and keep the graph as a structural minimap.
- Outline first: make the outline the daily workspace and keep it separate from card-first reflection.
- Smart defaults: preselect stress-test type, critique depth, and learning scaffold based on the current claim, confidence, and topic.
- Clean endings should read as a trust signal: the product should be optimized for finished work, not engagement.
- Structural health should be visible on the graph through node weight, saturation, border thickness, and density indicators.
- Edge styling should encode dependency strength, support versus contradiction, recency, and cascade risk.
- Load-bearing highlighting should isolate the claims other claims depend on so the user can see the skeleton of the map.
- Assumption auto-extraction should turn implicit assumptions into confirmable nodes at capture time.
- Density preview should warn the user about the structural consequence of creating a new dependency before they commit to it.

## Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma ORM
- SQLite for local development

## What is implemented

- Marketing landing page with product positioning
- Authenticated-style app shell for a demo founder
- Dashboard with seeded sessions
- New idea flow
- Stateful session workspace with two-pane layout
- Stage tracking, question budget, weakest-assumption pressure, and logic-only fallback
- Session persistence and resume flow
- Founder Concept Brief generation
- Capture form with probability, provenance, stakes, dependency notes, and assumption suggestions
- Workspace surfaces for dialectic rounds, synthesis gates, move query, old selves, belief genealogy, confidence drift, and a card-first graph minimap
- Bayesian propagation through the claim graph with overrideable cascade previews
- Belief archaeology panel and session-end reflection ritual for deeper memory and close-out
- Challenge-skill calibration on the critique surface so Penny can pitch difficulty to the user's current state
- Founder brief synthesis gates with pre-mortem, if-you-were-right, twin-check, stakes level, and dependency completeness
- Curriculum and education surface for student mode, instructor views, classroom shape views, and curriculum packs
- Shapes dashboard with Brier trajectory, domain calibration, private bets, Bayesian updates, and post-mortems
- Prompt templates under [`prompts/`](/Users/bensuo/Desktop/penny/prompts)

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create and migrate the local database:

```bash
npm run db:migrate
```

3. Seed demo sessions:

```bash
npm run db:seed
```

4. Start the app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Notes

- The current LLM and evidence layers are provider-agnostic abstractions backed by mock adapters so the product works end-to-end without external API keys.
- The evidence service intentionally stays lightweight. If retrieval fails, the app falls back to logic-only mode and continues the session.
- The Prisma client is generated automatically by Prisma commands using the standard `@prisma/client` package.
- The product direction is intentionally opinionated: Penny is a pressure-tested second brain, not a general-purpose chatbot or note system.
- The tunnel/workflow model is intentionally opinionated: separate capture from reflection, respect deep work, and end cleanly after synthesis.
- Workflow rule: when work moves from one file to another, commit and push the finished file before starting the next one. Use `scripts/codex-commit.sh --each-path <paths...>` so each file gets its own short commit message and push. Keep commits non-private and do not stage personal, secret, scratch, or machine-specific files. Push straight to the configured GitHub remote only and fail instead of guessing if no safe remote exists.
