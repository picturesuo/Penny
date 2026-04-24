# Challenge + Learn UI

Terminal 3 owns the MVP Challenge and Learn mode experience in:

- `apps/web/components/challenge/**`
- `apps/web/components/learn/**`
- `apps/web/lib/viewmodels/challenge/**`
- `apps/web/lib/viewmodels/learn/**`
- `tests/ui/challenge/**`
- `tests/ui/learn/**`

## Challenge

Challenge mode reads the existing workspace challenge projection and shapes it into:

- selected claim card
- strongest counterargument card
- key weakness summary
- what is at stake section
- critique transparency card for status, round, provider, model, prompt, and response state
- dependency cascade summary from assumptions, likely failure modes, and follow-up questions
- response actions for `Defend`, `Revise`, and `Absorb`

The mode keeps the stronger amber/orange accent locally in the Challenge component CSS module. Recording a response still uses the existing `POST /api/commands/challenge/respond` route and stores the selected response action as `responsePath`.

## Learn

Learn mode reads the existing workspace Learn projection and builds a muted green teach-back surface:

- selected claim card
- teach-back writing area
- three-step practice path: Explain, Example, Edge case
- retrieval checks for recall, evidence, and remembered challenge
- learning state card with selected map, selected claim, placeholder status, and local draft length

Learn is intentionally local-only for this slice. It does not add backend schema, provider calls, or command writes.

## Boundaries

- No provider wrapper changes.
- No backend schema changes.
- No global shell redesign.
- `apps/web/components/penny-shell.tsx` only delegates the existing Challenge and Learn mode branches to the new owned components.

## Verification

Targeted checks run on 2026-04-24:

```bash
pnpm exec tsx --test tests/ui/challenge/challenge-experience.test.ts tests/ui/learn/learn-experience.test.ts
pnpm exec eslint apps/web/components/penny-shell.tsx apps/web/components/challenge/challenge-experience.tsx apps/web/components/learn/learn-experience.tsx apps/web/lib/viewmodels/challenge/challenge-experience.ts apps/web/lib/viewmodels/learn/learn-experience.ts tests/ui/challenge/challenge-experience.test.ts tests/ui/learn/learn-experience.test.ts
```

`pnpm --dir apps/web typecheck` still fails in existing non-Terminal-3 paths on `.ts` import suffix handling and backend projection/command typing issues. No new touched-file type errors were reported before those existing failures.
