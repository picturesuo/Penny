# Penny Codebase Cleanup Audit

Date: 2026-05-20

Goal: audit tracked source, test, config, and doc files for alignment with the current Penny direction:
Brain import/profile/review, persistent private memory, Brain -> Create first-run flow, five Create option cards,
multi-select plus comment judgment, coding prompt artifact/export, verification/privacy/scope protections,
model-backed Create with deterministic fallback, and Learn kept working without expansion.

## Evidence Gathered

- `git status --short --branch`
- `git ls-files`
- `find . -maxdepth 2 -type d`
- `git status --short --ignored apps packages/shared .turbo node_modules tsconfig.tsbuildinfo`
- `rg` for `Check`, `check`, `challenge`, `autopilot`, `GPT wrapper`, `generic chatbot`, `mock`, `TODO`, `unused`, `deprecated`, and old mode labels
- import-reachability scan from `packages/brain/src/server.ts` and `packages/brain/frontend/src/main.tsx`
- targeted reads of root instructions, package scripts, server route registrations, frontend mode shell, Create workspace, route tests, mode contracts, and P3 route gate

Current tracked inventory is 270 files. `apps/` and `packages/shared/` exist only as ignored local directories in this checkout; they have no tracked files to audit. `packages/brain/public/assets/*` are tracked generated build assets and must only change through `pnpm build`.

Brain Ranker persistence is now tracked in `packages/brain/src/brain-ranker-persistence.ts` and wired through Create route tests. Keep it as part of the protected private-memory/Create progress path.

Completed during this cleanup pass:

- Refactored the visible MVP mode contract from `Check` to `Create` while keeping internal challenge/verify semantics.
- Renamed the active frontend workspace component/imports from `CheckWorkspace` to `CreateWorkspace`.
- Removed the old `/api/check` backend route stack, matching frontend client methods/types, and stale URL assertions.
- Updated stale user-facing docs from visible Check-mode wording to Create/Challenge/Verify wording.
- Focused route/client tests passed after the `/api/check` deletion: `pnpm exec tsx --test packages/brain/frontend/test/brainClient.test.ts packages/brain/src/server.test.ts packages/brain/src/p3-route-preservation.test.ts`.
- Full `pnpm typecheck` passed after the cleanup and connector follow-up commits landed.
- Full `pnpm test` passed with 433 tests.
- `pnpm build` passed and refreshed the tracked frontend bundle.

## File Inventory Inspected

Root and workflow/config:

- `.claude/commands/commit-push-pr.md` - keep
- `.claude/settings.json` - keep
- `.dockerignore` - keep
- `.env.example` - keep
- `.github/workflows/deploy-azure.yml` - keep
- `.gitignore` - keep
- `AGENTS.md` - keep, with product truth still authoritative
- `CLAUDE.md` - keep
- `Dockerfile` - keep
- `drizzle.config.ts` - keep
- `package.json` - keep
- `pnpm-lock.yaml` - keep
- `tsconfig.json` - keep

Docs:

- `docs/agent-workflow.md` - keep
- `docs/alpha-demo-golden-path.md` - keep; remaining "Check" usages are ordinary verification instructions
- `docs/alpha-readiness.md` - keep; remaining "Check" usage is an ordinary verification instruction
- `docs/autopilot-test-plan.md` - keep; visible mode wording is Brain/Create/Learn and Autopilot remains internal next-move test coverage
- `docs/azure-deploy.md` - keep
- `docs/challenge-brief-spec.md` - keep; challenge brief remains a protected artifact concept
- `docs/challenge-loop-spec.md` - keep; challenge semantics still protect stress-test quality and Defend/Revise/Absorb
- `docs/demo-runbook.md` - keep
- `docs/deployment.md` - keep
- `docs/dogfood-runbook.md` - keep
- `docs/google-connector-architecture.md` - keep; it protects provenance/privacy for connector-backed context
- `docs/knowledge.md` - keep; durable shared knowledge
- `docs/move-taxonomy.md` - keep; append-only Move taxonomy remains product truth
- `docs/p3-deletion-gate.md` - keep; visible MVP modes are Brain/Create/Learn and route-preservation policy remains
- `docs/penny-mvp.md` - keep; old mode naming no longer appears in the stale-doc scan
- `docs/private-working-memory-engine-strategy.md` - keep; aligns with persistent private memory
- `docs/queue.md` - keep; completed cleanup note now says Create/Learn props
- `docs/thinking-mode-autopilot-spec.md` - keep/defer; internal Autopilot/focus contract is still tested, but the visible mode label should be Create if emitted to users
- `docs/yc-demo-script.md` - keep
- `docs/yc-mvp-demo.md` - keep; visible flow now points to Create challenge or Verify recommendations

Drizzle and schema history:

- `drizzle/0000_daily_doctor_doom.sql` through `drizzle/0032_add_connector_persistence.sql` - keep; migration history should not be rewritten during cleanup
- `drizzle/meta/0000_snapshot.json` through `drizzle/meta/0026_snapshot.json` and `drizzle/meta/_journal.json` - keep; generated migration metadata

Scripts and fixtures:

- `scripts/azure-bootstrap.sh` - keep
- `scripts/smoke-thinking-mode.sh` - keep/defer; smoke still targets Thinking Mode and challenge/verify internals
- `test/brain/nextMoveEngine.test.ts` - keep
- `test/fixtures/penny-brain-demo-conversations.json` - keep; already aligned with memory-native Create
- `test/fixtures/penny-yc-demo-graph.json` - keep/defer; fixture still says thinking autopilot and challenge, but it is testing legacy next-move semantics rather than visible Create copy

Frontend active app:

- `packages/brain/frontend/index.html` - keep
- `packages/brain/frontend/src/App.tsx` - keep; internal Create naming is aligned and active modes are Brain/Create/Learn
- `packages/brain/frontend/src/api/brainClient.ts` - keep; legacy `/api/check` client methods were removed, while Create, Brain memory, Learn, Verify, Challenge response, and scoped headers remain
- `packages/brain/frontend/src/autopilotUx.ts` - keep; maps challenge/verify candidates into visible Create
- `packages/brain/frontend/src/components/AskPennyRenderedText.css` - keep
- `packages/brain/frontend/src/components/AskPennyRenderedText.tsx` - keep
- `packages/brain/frontend/src/components/BrainWorkspace.tsx` - keep; Brain import/profile/review and recents are protected
- `packages/brain/frontend/src/components/CanvasEdgeLayer.tsx` - keep
- `packages/brain/frontend/src/components/CanvasNodeCard.tsx` - keep
- `packages/brain/frontend/src/components/CanvasWorkspace.tsx` - keep; internal `check` action label already renders as Create
- `packages/brain/frontend/src/components/CreateWorkspace.tsx` - keep; component/import name is aligned, while `.check-*` CSS class names remain deferred implementation selectors
- `packages/brain/frontend/src/components/Header.tsx` - keep; visible nav is already Brain/Create/Learn
- `packages/brain/frontend/src/components/LandingPage.tsx` - keep; first-run Brain/Create/Learn entry is protected
- `packages/brain/frontend/src/components/LearnWorkspace.tsx` - keep; "quick check" and lesson-check language is educational, not stale Check mode copy
- `packages/brain/frontend/src/components/PennyMark.tsx` - keep
- `packages/brain/frontend/src/lib/format.ts` - keep
- `packages/brain/frontend/src/lib/text.ts` - keep
- `packages/brain/frontend/src/main.tsx` - keep
- `packages/brain/frontend/src/styles.css` - keep/defer; many `.check-*` selectors are implementation names still used by the Create workspace, so do not trim them until component selector names are migrated and built
- `packages/brain/frontend/src/types/brain.ts` - keep; legacy `/api/check` route types were removed, while Create, Brain memory, Learn, Verify, canvas, and scope types remain
- `packages/brain/frontend/tsconfig.json` - keep
- `packages/brain/frontend/vite.config.ts` - keep

Frontend tests:

- `packages/brain/frontend/test/askPennyRenderedText.test.ts` - keep
- `packages/brain/frontend/test/autopilotUx.test.ts` - keep
- `packages/brain/frontend/test/brainClient.test.ts` - keep; old `/api/check` client assertions were removed
- `packages/brain/frontend/test/brainWorkspace.test.ts` - keep
- `packages/brain/frontend/test/canvasWorkspace.test.ts` - keep
- `packages/brain/frontend/test/createWorkspace.test.ts` - keep; imports `CreateWorkspace`
- `packages/brain/frontend/test/landingPage.test.ts` - keep
- `packages/brain/frontend/test/learnWorkspace.test.ts` - keep
- `packages/brain/frontend/test/modeLabels.test.ts` - keep; already asserts Brain/Create/Learn

Generated frontend build:

- `packages/brain/public/index.html` - keep generated
- `packages/brain/public/assets/index-5JCTnHvx.css` - keep generated, do not hand-edit
- `packages/brain/public/assets/index-Bvp6x9vC.js` - keep generated, do not hand-edit

Backend production source:

- `packages/brain/src/after-move-effects.ts` - keep; protects persistent memory/self-knowledge effects
- `packages/brain/src/artifact-ai.ts` - keep
- `packages/brain/src/artifact-commands.ts` - keep
- `packages/brain/src/artifact-core.ts` - keep; legacy artifact compiler is preserved by P3 gate until focused deletion
- `packages/brain/src/artifact-route.ts` - keep/defer; compatibility route, P3 gate says deprecate only
- `packages/brain/src/assumption-response-route.ts` - keep
- `packages/brain/src/autopilot-core.ts` - keep/defer; internal next-move engine still drives Brain/Create/Learn routing
- `packages/brain/src/autopilot-route.ts` - keep/defer; P3 gate says legacy alias, deprecate only
- `packages/brain/src/brain-documents-route.ts` - keep
- `packages/brain/src/brain-memory-route.ts` - keep; protected private memory import/profile/review path
- `packages/brain/src/brain-objects-route.ts` - keep
- `packages/brain/src/brain-ranker-persistence.ts` - keep; records Create ranker runs and development events against scoped Brain Ranker tables
- `packages/brain/src/brain-ranker.ts` - keep; supports Personal/Practical/Valuable/Critical/Weird Create ranking
- `packages/brain/src/brain-run-guard.ts` - keep
- `packages/brain/src/brain-search-route.ts` - keep; Penny-native lexical/graph/hybrid search is allowed
- `packages/brain/src/brain-seed-route.ts` - keep
- `packages/brain/src/candidate-brain-object.ts` - keep
- `packages/brain/src/challenge-ai.ts` - keep; internal Challenge remains stress-test capability
- `packages/brain/src/challenge-commands.ts` - keep
- `packages/brain/src/challenge-core.ts` - keep
- `packages/brain/src/challenge-route.ts` - keep/defer; legacy direct LLM route is P3 deprecate-only
- `packages/brain/src/check-route.ts` - deleted; old `/api/check` project/cycle stack was not used by the active Create frontend and duplicated the new Create flow
- `packages/brain/src/claim-detail-route.ts` - keep
- `packages/brain/src/command-idempotency.ts` - keep; protects write idempotency
- `packages/brain/src/context-connector-service.ts` - keep
- `packages/brain/src/context-layer-repository.ts` - keep
- `packages/brain/src/context-layer-route.ts` - keep
- `packages/brain/src/context-layer.ts` - keep
- `packages/brain/src/create-route.ts` - keep; stale Check wrapper/backend generated artifact copy was removed, while model-backed Create plus deterministic fallback remain
- `packages/brain/src/db/client.ts` - keep
- `packages/brain/src/db/schema.ts` - keep; do not weaken scope/privacy schema
- `packages/brain/src/domain/engine.ts` - keep; next-move ranking still recommends stress-test/verify/learn/save
- `packages/brain/src/domain/repository.ts` - keep; scope filters and row-in-scope checks protect privacy
- `packages/brain/src/domain/types.ts` - keep; `MvpMode` is aligned to Brain/Create/Learn
- `packages/brain/src/embedding-provider.ts` - keep/defer; embeddings are present but Penny-native search is also implemented
- `packages/brain/src/google-connector-route.ts` - keep; current connector support is privacy/scoping relevant
- `packages/brain/src/google-connector.ts` - keep
- `packages/brain/src/hybrid-retrieval.ts` - keep
- `packages/brain/src/inline-learn-ai.ts` - keep
- `packages/brain/src/inline-learn-commands.ts` - keep
- `packages/brain/src/inline-learn-core.ts` - keep; Learn should continue working
- `packages/brain/src/inline-learn-route.ts` - keep
- `packages/brain/src/learn-plan.ts` - keep
- `packages/brain/src/learn-recipe.ts` - keep
- `packages/brain/src/learn-session-output.ts` - keep
- `packages/brain/src/learn-session-route.ts` - keep; visible mode labels are aligned while internal check/action semantics remain where needed
- `packages/brain/src/lens-snapshot.ts` - keep
- `packages/brain/src/modes.ts` - keep; visible MVP mode is Create, with challenge/verify/artifact mapped under Create
- `packages/brain/src/move-payloads.ts` - keep
- `packages/brain/src/next-move-engine.ts` - keep/defer; not production-reachable from server but imported by external root test fixture
- `packages/brain/src/observability.ts` - keep
- `packages/brain/src/penny-benchmark.ts` - keep; benchmark product truth is explicitly requested
- `packages/brain/src/providers.ts` - keep; provider-safe schemas and deterministic fallback remain protected
- `packages/brain/src/recipe-engine.ts` - keep
- `packages/brain/src/routes/challenge-brief-routes.ts` - keep
- `packages/brain/src/routes/session-cockpit-routes.ts` - keep
- `packages/brain/src/routes/thinking-mode-routes.ts` - keep; visible mode contract labels are Create-aligned
- `packages/brain/src/schema.ts` - keep
- `packages/brain/src/scope.ts` - keep
- `packages/brain/src/search-broker.ts` - keep
- `packages/brain/src/search-decision-service.ts` - keep
- `packages/brain/src/seed-persistence.ts` - keep
- `packages/brain/src/seed.ts` - keep
- `packages/brain/src/server.ts` - keep; `/api/check` registrations were removed, while auth/rate/scope protections remain
- `packages/brain/src/services/challenge-brief-service.ts` - keep
- `packages/brain/src/services/challenge-service.ts` - keep
- `packages/brain/src/services/thinking-mode-service.ts` - keep; visible mode contract labels are Create-aligned
- `packages/brain/src/session-canvas-route.ts` - keep
- `packages/brain/src/session-graph-route.ts` - keep
- `packages/brain/src/session-moves-route.ts` - keep
- `packages/brain/src/shapes.ts` - keep
- `packages/brain/src/source-loading.ts` - keep
- `packages/brain/src/stream-route.ts` - keep
- `packages/brain/src/tools/internal-tool-registry.ts` - keep/defer; not production-reachable but tested as a tool contract
- `packages/brain/src/verify-ai.ts` - keep
- `packages/brain/src/verify-commands.ts` - keep
- `packages/brain/src/verify-core.ts` - keep; system prompt now says "Penny Verify" and verification logic remains
- `packages/brain/src/verify-recipe.ts` - keep
- `packages/brain/src/verify-route.ts` - keep
- `packages/brain/src/wiki-route.ts` - keep; compiled WikiPage view remains not source of truth

Backend tests:

- Keep tests for Brain, Create, Learn, challenge/verify, memory, privacy/scope, search, connectors, command idempotency, schema, and server auth.
- Refactor tests that assert visible `Check` mode labels to `Create`.
- `packages/brain/src/check-route.test.ts` was deleted with `check-route.ts`.
- Keep compatibility tests named in the P3 gate unless their target route is explicitly removed with replacement coverage.

## Risky Items And Decisions

### Old `/api/check` route stack

Classification: completed deletion.

Evidence:

- `packages/brain/src/check-route.ts` was registered in `server.ts` under `/api/check/*`.
- The active Create workspace imports `createNext`, `compareCreateProviders`, `exportCodingPrompt`, and `submitCreateExportFeedback`, not the old Check client methods.
- Frontend `brainClient.ts` exported old Check client methods, and `brainClient.test.ts` tested only their URLs.
- P3 route preservation does not list `/api/check/*` as a protected compatibility route.
- The old stack duplicates the new Create path with project/cycle/check language and can confuse onboarding.

Completed change:

- Remove `packages/brain/src/check-route.ts`.
- Remove `/api/check/*` imports and registrations from `packages/brain/src/server.ts`.
- Remove old Check route tests.
- Remove unused Check client methods/types and their URL assertions from the frontend.
- Verified no remaining code references with `rg` across backend source, frontend source, and frontend tests.
- Focused route/client tests and frontend typecheck passed.
- Full `pnpm typecheck`, `pnpm test`, and `pnpm build` passed after the cleanup and connector follow-up commits landed.

### Visible mode label `Check`

Classification: completed refactor.

Evidence:

- Frontend nav already exposes `Brain`, `Create`, `Learn`.
- Backend `modes.ts` exposed `["Learn", "Check", "Brain"]`.
- Thinking-mode service payloads and tests returned `mvpMode: "Check"` for challenge/verify/artifact candidates.

Completed change:

- Change `MvpMode` visible values to `["Learn", "Create", "Brain"]`.
- Map `challenge`, `verify`, and `artifact` thinking modes to `Create`.
- Update backend route/service/tool tests.
- Keep internal action names such as `challenge`, `verify`, and `check` where they model stress-test behavior or educational quick checks.
- Stale visible-mode doc copy has been updated; remaining `Check` hits are ordinary verbs, Learn quick-check copy, or historical/internal critique context.

### `CheckWorkspace` name and `.check-*` selectors

Classification: completed/defer split.

Evidence:

- The visible UI copy in `CreateWorkspace.tsx` is Create-oriented.
- The component/file name has been aligned.
- Many `.check-*` CSS selectors are still actively used by the Create workspace.

Completed/deferred change:

- Rename the component/file/import path to `CreateWorkspace`.
- Leave `.check-*` class selectors for a later focused CSS migration unless all selector references are renamed and `pnpm build` proves generated assets are consistent.

### Autopilot terminology

Classification: keep/defer.

Evidence:

- Autopilot appears in routes, docs, fixtures, tests, and next-move service.
- Frontend maps challenge/verify next moves into visible `Create`.
- P3 route gate explicitly preserves active session Autopilot routes and deprecates legacy aliases only.

Proposed change:

- Do not delete Autopilot code in this cleanup pass.
- Update docs where Autopilot is presented as a visible mode rather than an internal next-move/focus engine.

### Challenge and Verify terminology

Classification: keep.

Evidence:

- Product truth still includes challenge quality, Defend/Revise/Absorb, Challenge Brief, and verification.
- Protected flow includes verification.
- These terms are internal capabilities under Create/Brain, not necessarily visible top-level modes.

Proposed change:

- Keep challenge/verify routes and tests.
- Replace visible `Check` labels with `Create`, but do not erase challenge semantics.

### Learn "check" wording

Classification: keep.

Evidence:

- Learn uses "quick check", "check the work", and educational worksheet language.
- This is concept-checking inside Learn, not old Check mode branding.

Proposed change:

- Do not rename Learn quick-check copy unless it visibly conflicts with Create onboarding after runtime review.

### Generated public assets

Classification: keep generated.

Evidence:

- `packages/brain/public/assets/*` are generated build artifacts.

Proposed change:

- Never hand-edit these files.
- If frontend source changes, run `pnpm build` and commit generated asset changes as a separate generated-build change.

### Brain Ranker persistence

Classification: keep.

Evidence:

- It writes to Brain Ranker tables that are already in the committed schema.
- It is now tracked and tested through Create route persistence coverage.
- It supports the protected Create path by preserving which private-memory signals shaped option cards.

Proposed change:

- Keep it and avoid weakening its scope fields or idempotent write behavior.

## Cleanup Order

1. Done: commit this audit.
2. Done: refactor visible mode contract from Check to Create.
3. Done: update stale user-facing Check docs and generated Create artifact copy.
4. Done: rename `CheckWorkspace` to `CreateWorkspace` without changing behavior.
5. Done: remove the old `/api/check` backend/client stack after focused tests and frontend typecheck passed.
6. Done: rebuilt public assets and committed the generated bundle refresh.
7. Done: full `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
8. Done: dead `/api/check` code references are gone; remaining doc/code `Check` hits are ordinary verbs, Learn quick-check copy, or internal critique semantics rather than visible mode labels.

## Current Proposed Changes By Classification

Keep:

- Brain memory import/profile/review, Brain recents, private memory schema, context-layer scope checks, connector provenance/privacy, command idempotency, BrainRun guard, Create route/provider/fallback, Brain Ranker, Create export feedback, Learn routes/workspace, challenge/verify services, session cockpit/canvas/search, auth/rate limiting, migrations, generated public assets, package scripts.

Completed:

- Visible backend MVP mode label `Check` -> `Create`.
- `create-route.ts` artifact copy that said "Check workspace wrapper" or "existing Check backend routes".
- `verify-core.ts` system prompt that called Verify "Penny Check".
- Frontend `CheckWorkspace` component/file/import name to `CreateWorkspace`.
- Old `/api/check` route stack and matching frontend client/types/tests.

Refactor:

- No visible Check-mode docs remain from this pass.

Delete:

- No additional delete candidates are safe yet.

Defer:

- Autopilot route/alias deletion, because P3 explicitly says deprecate only.
- Broad challenge/verify route deletion, because they protect stress-test/verification.
- `.check-*` CSS selector migration until a focused rename can be verified by build and screenshot/runtime checks.
- Any in-flight local connector/profile changes until they are either committed by their owner or deliberately included in a focused cleanup batch.
- Any migration/schema rewrite.
