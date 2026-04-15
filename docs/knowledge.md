# Knowledge

## User-Provided Knowledge
- Capture durable user guidance, preferences, and constraints that should survive past a single task.
- `user`: Penny’s three main use cases should be framed as: a pressure-tested second brain/personal idea wiki, stress testing the ideas inside that wiki, and a learning loop that recommends the best next thing to learn.
- `user`: The first priority is the pressure-tested second brain. Product structure and trackers should make that active focus explicit while still keeping stress testing and learning visible as planned lanes.
- `user`: The second-brain framing should draw from Karpathy’s LLM wiki as inspiration, but Penny should emphasize pressure testing and actionable progress rather than passive note storage.
- `user`: On the map page, `Best next move` should be the primary above-the-fold focus.
- `user`: Penny should feel like a personal thinking/wiki system that works for founders, not a founder-only operating system.
- `user`: The learning loop should merge into the best-next-move area rather than compete with it as a separate primary section.
- `user`: Users should both revisit/refine existing maps repeatedly and open new ones often, more like a high-intensity ChatGPT workflow.
- `user`: Near-term priority is frontend hierarchy and polish because the workspace currently feels chopped.

## Project Facts
- Capture stable project facts, decisions, and summaries worth reusing across tasks.
- `repo`: `src/server/thought-map.ts` keeps `getThoughtMap()` as the authoritative server hydration path for map-page work. It maps persisted nodes, applies `buildThoughtMapJudgment()`, computes `founderBriefReadiness`, and then syncs/open-orders interventions before returning the `ThoughtMapModel`.
- `repo`: The first outline/graph map-page slice should reuse the existing `ThoughtMapModel` payload from `getThoughtMap()` instead of introducing a graph-only transport. The current payload already includes `parentId`, judged `scores`, `nodeStatus`, `graphSnapshot`, `recommendedNextMove`, interventions, founder brief data, and founder-brief readiness.

## Retrieval Hints
- Search this file, the shared context file, and nearby repo docs with `rg` before broader search.
- Label each note by source when useful: `user`, `repo`, or `external`.
