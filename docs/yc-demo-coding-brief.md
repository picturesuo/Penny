# Penny YC Demo Coding Brief

Status: ready-to-code brief for CMUX + Codex
Date: May 23, 2026

## Goal

Make the YC demo path feel like a memory-native creativity workbench:

Landing -> Start Create -> YC-safe Brain fixture -> rough founder idea -> fake/safe email and messages context -> five equal creative directions -> human selection and comment -> structured artifact -> Learn bridge -> return to Create -> visual Canvas -> export prompt/spec.

The video should prove:

> Penny uses personal context to give ideas direction, structure, and buildable descriptions without taking judgment away from the human.

Do not pitch Penny as connected-to-everything, a chatbot, or a generic memory app.

## Peter-Style Workspace

Use CMUX as the coding cockpit and Codex app as the reading/thinking surface.

- CMUX sidebar: persistent repo/workspace sessions.
- CMUX surface tabs: persistent workstreams inside the Penny workspace.
- Active coding: one large visible Codex CLI surface at a time.
- Codex CLI model setting: `gpt-5.5 medium` for all workstream tabs.
- Parallelism: multiple Codex CLI sessions can live as tabs, each with a narrow workstream.
- Codex app: use for reading, summaries, strategy, and long context. Do not use it as the main code-editing surface.

Recommended CMUX tabs:

1. `lead` - coordinates scope, checks git, commits/pushes finished changes.
2. `fixture` - verifies and edits YC fixture/import evidence only.
3. `create-ui` - landing and Create board polish.
4. `learn-canvas` - Learn bridge, Canvas, artifact/export ending.
5. `verify` - typecheck, tests, build, browser smoke, proof capture.
6. `preview` - local app browser.

Only split panes temporarily when comparing UI and logs. Default back to a single large pane with tabs.

## Source Of Truth

Read these first in any fresh agent session:

- `AGENTS.md`
- `docs/yc-demo-runbook.md`
- `docs/claimed-completion-audit.md`
- `docs/yc-stability-report.md`
- `test/fixtures/penny-yc-founder-fixture.json`
- `test/e2e/yc-recording.spec.cjs`

Current important fact: the repo already has a YC fixture, landing CTA, Create cards, Learn bridge, Canvas proof, export path, e2e test, and proof assets. The next coding pass should verify what is actually weak before rebuilding.

## Demo Prompt

Use this exact prompt in the demo:

```text
I want to create a YC startup around ideation and thinking - maybe a thinking instrument. It should use my past emails, messages, and notes to help me turn vague ideas into buildable structure. I want it to feel like a workbench that gives ideas direction without taking judgment away from the human.
```

Then select:

- Personal
- Valuable
- Critical

Add this comment:

```text
Make this founder/builder focused. Keep the memory-native creativity angle, but make the output concrete enough that I could build it with Codex.
```

## Non-Negotiables

- Use fixture/manual context only for the YC video.
- Do not demo live Gmail OAuth.
- Do not build real iMessage/SMS.
- Do not claim live connectors.
- Label messages honestly as `Manual messages context for demo`.
- Label email honestly as `Email fixture` or `Gmail-style context`.
- Preserve `trainingUse=false` in visible demo copy.
- Show five equal options. Do not visually command one next-best answer.
- Keep human judgment central: options -> selection -> comment -> artifact.
- End on a visual structure plus export, not a wall of text.

## Workstream Prompts

### lead

```text
You are the lead coordinator for the Penny YC demo pass. Read AGENTS.md, docs/yc-demo-runbook.md, docs/claimed-completion-audit.md, docs/yc-stability-report.md, and git status. Do not rebuild completed work. Identify the smallest current gap between the repo and the desired demo spine. Coordinate focused changes, verify, then commit and push each finished repo-visible change on main.
```

### fixture

```text
You own only the YC-safe Brain fixture and its import/evidence display. Read test/fixtures/penny-yc-founder-fixture.json, source-loading/import code, and Create evidence rendering. Make the fixture clearly personal: Lovable hackathon, ideation instrument has legs, before coding agents, founder/builder uncertainty, not GPT wrapper, rejected notes/dashboard/chatbot/assistant directions. Keep sources safe and honest: Email fixture, Gmail-style context, Manual messages context for demo, Founder notes, trainingUse=false. Do not add live Gmail or real Messages access.
```

### create-ui

```text
You own landing -> Create and Create board polish. Read LandingPage, App routing, CreateWorkspace, create-route, and yc-recording e2e. The demo must start from landing with Start Create, load the YC fixture, show the rough idea, five equal cards (Personal, Practical, Valuable, Critical, Weird), source chips, evidence drawer, multi-select, comment box, artifact outline, and export. Do not turn this into a chatbot or generic dashboard.
```

### learn-canvas

```text
You own artifact ending, Canvas, Learn bridge, and export content. Read LearnWorkspace, inline learn route/core, session canvas route, artifact route/core/commands, CreateWorkspace export code, and yc-recording e2e. The final artifact must include Product thesis, Target user, Problem, Why now, Core loop, Memory layer, Create mode, Learn bridge, Data sources, Moat, Risks, MVP scope, Demo script, and Build prompt/export. Canvas must show Penny -> Brain -> Create -> Learn -> Export. Learn this must open from a Create option, offer Explain simply, Show worked example, and Show how this applies to my artifact, then return to Create without losing state.
```

### verify

```text
You own stability proof only. Do not make product changes unless a failing test points to a narrow defect. Run pnpm typecheck, pnpm test, pnpm build, then the YC recording Playwright spec against the local app. Capture or update proof only after the product path passes. Record exact commands and outcomes in docs/yc-stability-report.md if verification changes.
```

## Exact Run Commands

Use the fallback dev server when the remote database is unavailable:

```bash
DATABASE_URL= PENNY_SKIP_DATABASE_PREP=true PENNY_AUTH_MODE=dev PORT=3007 pnpm dev
```

Open:

```text
http://localhost:3007
```

Core verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Use this existing e2e path:

```bash
PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --reporter=line
```

## Finish Criteria

The demo is ready when a human can record this path twice without improvising:

1. Landing says what Penny is and offers one obvious Create path.
2. Start Create loads the YC-safe fixture.
3. Create shows five equal personal options with source evidence.
4. User selects Personal + Valuable + Critical and adds the demo comment.
5. Artifact updates into the requested YC outline.
6. Learn this explains a technical point and returns to Create with state preserved.
7. Canvas shows Brain, Create, Learn, and Export as a visual structure.
8. Export produces a coding-agent prompt/spec.
9. The closing line is true: Penny is not a chatbot; it is a memory-native creativity workbench.
