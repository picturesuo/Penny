# Penny

Penny is an ideation instrument for people who need to understand and resolve ideas. It captures raw thought, pressure-tests it against evidence and precedent, teaches what the user does not understand in the moment they need it, and reflects thinking patterns back to the user so learning compounds over time.

It is not a note-taking app, not a chatbot, and not a wiki. It is a workbench for raw thought that should produce structured creativity, load-bearing outputs, and self-knowledge that compounds.

## Product Direction

Penny is built around three core functions:

- Second brain: capture claims, assumptions, evidence, counterarguments, and open questions in structured form.
- Stress-test: challenge weak evidence, shaky assumptions, missing comparisons, risky dependencies, and unsupported leaps, with precedent where possible.
- Learning: teach at the point of confusion, using the claim graph to drive just-in-time explanations instead of a separate reading list.

### Learning Features

- Teach-back by default: Penny gives a minimum scaffold, then asks the user to explain the concept in the context of the current claim.
- Prior-knowledge anchoring: every learning moment should connect to an existing claim in the graph.
- Knowledge shape tracking: Penny should remember what the user has mastered, what they keep needing to relearn, and what is solid.
- Research-mode expansion: optional follow-up only, clearly separated from the inline learning moment so it stays anchored to the triggering claim.

### Decision & Synthesis Features

- Pre-mortem as a synthesis gate: before any output artifact is generated, the user imagines how it fails in six months.
- If-you-were-right mode: assume the claim is true and ask what becomes possible, what becomes necessary, and what the user would do in 30 days.
- Stakes-proportional friction: load-bearing claims get more stress-testing, more pre-mortems, and a tighter revisit cadence.
- Twin-check output: Penny produces the strongest version of the user’s current thinking, then the user decides whether it actually represents what they believe.
- Post-mortem protocol: when outcomes resolve, Penny turns them into first-class artifacts so the system learns from reality.

### Tunnel & Workflow

- Explicit stage exit criteria: capture, structure, stress-test, synthesize, and reflect should each feel completable.
- Dual-surface architecture: keep capture mode low-friction and critique-free, and keep reflection mode slow, structured, and stress-test heavy.
- Cognitive protection mode: when the user is deep in a load-bearing claim, Penny should suppress secondary prompts and unrelated surfaces.
- Clean endings: when a tunnel traversal completes, Penny should say so, hand over the artifact, and stop pulling for more engagement.
- Reflection stage: optional but rewarded, with a short shapes surface after synthesis that is easy to skip but high value when used.

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

## Interface & Aesthetic

- Density over breadth: well-stress-tested nodes should look richer and more confident, while shallow nodes stay thin and provisional.
- Emergent structure: avoid upfront tagging; let organization accrete from stress-testing and relationship inference.
- Progressive disclosure: keep the active stage front and center and keep other stages accessible but quiet.
- Outline first: make the outline the daily workspace and the graph a periodic zoom-out.
- Smart defaults: preselect stress-test type, critique depth, and learning scaffold based on the current claim, confidence, and topic.

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
