# Clickability Audit

Date: May 24, 2026

## Verdict

PASS for the current YC demo path and the local Brain-first dogfood path.

The visible YC fixture path reaches Create, Learn, Canvas, and export. The normal Brain-first path now also works in local demo mode with `PENNY_SKIP_DATABASE_PREP=true`: quick notes, save-to-Brain, document seed, import, Create, Learn, export, and refresh restore all pass in `test/e2e/brain-first.spec.cjs`.

This is still not a production-readiness pass. Public/staging still needs real Postgres, auth, rate limiting, and connector proof before any broad demo claims.

## Audit Commands

- Local server: `PORT=3039 PENNY_AUTH_MODE=dev PENNY_SKIP_DATABASE_PREP=true pnpm start`.
- Direct API check: `POST /api/brain/recents` returned `201` and later `GET /api/brain/recents` returned the same quick note.
- Direct API check: `POST /brain/seed` returned `201` in local fallback mode despite the stale configured database URL.
- `pnpm test`: passed, 668 tests.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- Latest targeted browser e2e: `PENNY_BASE_URL=http://localhost:3042 pnpm dlx @playwright/test test test/e2e/learn-understanding-tour.spec.cjs --reporter=line --output=.tmp-learn-understanding-tour`: passed, 1 test in 1.7s.
- Prior in-app browser smoke: imported a Brain note, rendered the Brain export panel, and exported a coding-agent prompt with Codex target, private context, and human-judgment guardrails.
- Prior in-app browser smoke: Create path renders six step buttons and the Judgment step button scrolls to the judgment section.
- Browser e2e: `yc-recording.spec.cjs`, `brain-first.spec.cjs`, and `learn-understanding-tour.spec.cjs` passed together, 3 tests in 8.1s; Brain-first now asserts quick-note save creates private Brain memory, Learn asserts the Source/Map/Teach/Use/Check tour, and Brain/Create export paths assert visible `Copy prompt` and `Download .md` actions.

## Control Findings

| Surface | Control | Expected | Actual | Root cause | Fix |
| --- | --- | --- | --- | --- | --- |
| Landing | Start with your Brain | Open Brain from a fresh public landing page. | Works; Brain workspace becomes visible. | `LandingPage` calls `onModeSelect("Brain")`. | Keep. Add e2e coverage that does not jump to internal routes. |
| Landing | Start Create | Load fixture and open Create. | Works; existing YC e2e passes. | Fixture import uses Brain memory route, which has in-memory fallback. | Keep as demo shortcut, but do not treat as proof of the Brain-first product loop. |
| Brain | Quick Note send | Save a visible, persisted quick note row. | Works in local demo mode and browser e2e. | `brain-objects-route.ts` now uses a scoped in-memory service when database prep is skipped in dev. | Keep DB-backed production behavior; keep local fallback covered. |
| Brain | Quick Note Save to Brain | Promote a quick note into Brain state. | Works in Brain-first e2e through the save-to-Brain action and visible status. | Saved Brain objects are now synced into source-backed private Brain memory; local fallback stores the saved object and imports the same content into the scoped memory profile. | Keep this server-owned so the frontend refreshes real memory instead of inventing graph state. |
| Brain | New Document | Open editor/creation surface inside Brain. | Works; sidebar New Document focuses the Brain document seed input. | Brain-first e2e asserts the focused seed form. | Keep. |
| Brain | Start a document form | Create a Brain document from typed thought. | Works in local demo mode through `/brain/seed` fallback and document listing fallback. | `brain-seed-route.ts` stores a scoped in-memory persisted seed; `brain-documents-route.ts` lists it. | Keep local fallback dev-only. |
| Brain | Add Folder | Create a folder or clearly disable it. | Disabled and labeled unavailable in the demo. | The visible command is intentionally not in scope. | Keep disabled until folder persistence is real. |
| Brain | Import Context | Import pasted context and show source-backed memories. | Works on current localhost; import completed and memory/source counts updated. | Brain memory route has explicit in-memory dev fallback. | Keep, then assert refresh behavior. Align recents/objects with this route's fallback model. |
| Brain | Review Brain Profile | Mark profile review complete. | Works; Brain shows a profile review card and the first-run flow only marks review done after `Profile looks right`. | `POST /api/brain/memory/profile/review` now records an explicit `profile_reviewed` Brain development event, the profile response returns `profileReview`, and the UI respects the stored fingerprint after reload. | Later: expose profile review history if multiple profile revisions need comparison. |
| Brain | Confirm memory | Update memory review state. | Works; memory cards show explicit `Memory state` labels and the update notice is a single `role=status` region with a stable test id and memory-specific text. | Icon-only button calls `reviewBrainMemory(node.id, "correct")`; UI now reflects the reviewed node state. | Keep. |
| Brain | Boost memory | Increase memory importance. | Works; boosted/high-confidence nodes get a visible state label and the update notice names the reviewed memory. | Icon-only button calls `reviewBrainMemory(node.id, "boost")`. | Later: show exact rank effect in Create evidence if needed. |
| Brain | Forget memory | Remove memory from retrieval. | Works and is reversible; first click arms the memory card with `Click trash again to forget`, second click soft-deletes it from retrieval, and the notice offers `Undo forget`. | `reviewBrainMemory(node.id, "forget")` now stores forgotten nodes server-side and `restore` clears the deleted state before retrieval/Create grounding. | Add browser coverage for visible removal/count decrease plus undo when the next Brain e2e pass expands memory review controls. |
| Brain | Start Create With This Brain | Open Create carrying actual Brain context. | Works; Create opens with Brain context and a generated rough idea from `createPromptFromBrainProfile`. | `handleStartCreateWithBrain` sets both `createBrainProfile` and `createInitialSeedText`; frontend test covers the seed prompt. | Later: let users pick a specific Brain note/document as the seed. |
| Brain | Export Coding Prompt | Export a coding prompt from the Brain flow. | Works; after imported Brain memory exists, Brain renders a coding-agent prompt panel and exports a prompt for Codex, Claude Code, and Cursor with private context, source evidence, memory evidence, human-judgment guardrails, copy, download, and textarea fallback. | `POST /api/brain/export-coding-prompt` builds from the private Brain memory profile; the Brain-first e2e asserts the exported textarea plus copy/download actions. | Keep. |
| Brain | Gmail disabled copy | Show honest Gmail unavailable/privacy state. | Works; status says unconfigured with missing Nango config and privacy copy says consent/no human review/trainingUse=false/delete-revoke. | Gmail connector status route reports gated/unconfigured state. | Keep. Ensure button remains disabled unless config is present. |
| Create | Brain pill/button | Return to Brain from Create. | Works when scoped to Create sidebar/header; global role query is ambiguous because many controls include "Brain". | Multiple visible buttons/text include "Brain"; accessible names are not unique. | Add a unique `aria-label`, e.g. `Open Brain from Create`. |
| Create | Step nav | Move between Rough idea, Five directions, Judgment, Prompt artifact, Verification, Export. | Works; the sidebar renders focusable step buttons and scrolls to the matching Create section while marking the current step with `aria-current="step"`. | `CreatePathSidebar` now receives `onStepSelect`; `CreateWorkspace` registers section refs for rough idea, five directions, judgment, Idea Spec, verification, and export. | Keep. Later: add keyboard-shortcut jumps only if recording/editing proves mouse navigation too slow. |
| Create | Rough idea textarea | Editable idea input. | Works. | Local state `draftText`. | Persist draft when Create is started from Brain. |
| Create | Generate control | Generate five directions from current prompt and Brain context. | Works; five cards appear. | `handleGenerateDirections` calls `/api/create/next`. | Keep; assert five lens labels every run. |
| Create | Option cards | Toggle Personal, Practical, Valuable, Critical, Weird selections. | Works; selected cards update state. | `toggleOption` updates local `selectedOptionIds`. | Persist selected IDs with the Create artifact/session. |
| Create | Evidence chips/details | Open readable source and memory evidence. | Works through `Details` drawer, not chips. | Option card details button opens `CreateOptionDetailsDrawer`. | Rename requirement/UI consistently: either chips or details. |
| Create | Comment | Save user judgment comment. | Works only after `Update artifact`; before that it is local state. | `userComment` is local until `/api/create/next` records a judgment. | Autosave draft or clearly require Update artifact. |
| Create | Artifact | Visibly change based on selected cards and comment. | Works; artifact text updates after selections/comment. | `/api/create/next` returns updated artifact and verification. | Keep; add refresh persistence assertion. |
| Create | Learn this | Open Learn from a technical Create option. | Works; Learn opens focused explanation and Back to Create preserves state while Create remains mounted. | `onLearnThis` sets `learnFocusNode` and switches mode. | Persist Create state so refresh/back survives remount, not just hidden component state. |
| Learn | Source-to-concept tour | Turn arbitrary input into a compact understanding path. | Works; Learn now renders a five-part Source / Map / Teach / Use / Check path with source-specific source and lesson-specific use/check text instead of generic filler. Each node is also an askable target that opens Ask Penny with a focused question. | `meaningMapItemsForLesson` derives the compact tour from source spans, lesson title, explanation, and source label; e2e asserts all five labels and that the Source node seeds Ask Penny. | Keep it compact; do not reintroduce long worksheet copy on the first screen. |
| Learn | Explain simply / worked example / applies to artifact | Each choice changes visible lesson content. | Works in the Create Learn bridge path. | `LearnWorkspace` builds three focused steps for the Create bridge node. | Keep; assert content changes in the real e2e. |
| Learn | Back to Create | Return with prompt/sources/selections/comment/artifact/evidence preserved. | Works without refresh because Create stays mounted and hidden. | `shouldRenderCreateWorkspace` keeps component mounted. | Persist the state; hidden mounted state is not enough for refresh. |
| Create | Canvas | Show Brain sources -> Create options -> Learn explanation -> Artifact/export. | Works for the demo: Canvas updates with imported Brain context, selected options, Learn bridge, and exported `.md` prompt. | `/api/create/next` now returns a backend-derived Create canvas snapshot from the option set, artifact, and judgment event; the frontend renders that snapshot and keeps the older local outline only as a saved-draft fallback. | Later: merge this Create snapshot into a broader session canvas if the graph view needs cross-mode history. |
| Create | Export | Produce copyable prompt/spec text. | Works after artifact generation; export shows `Copy prompt`, `Download .md`, and textarea fallback, and both Brain-first and YC recording e2e assert the actions. | `handleExportPrompt` calls `/api/create/export-coding-prompt`; prompt action controls call clipboard/download helpers with textarea fallback. | Keep. |

## Immediate Failure Chain

1. Fresh landing -> Brain works.
2. Quick Note send calls `POST /api/brain/recents` and returns `201` in local demo mode.
3. New Document uses `/brain/seed` and returns `201` in local demo mode.
4. Brain import creates source-backed memories.
5. Create uses that Brain context, preserves judgment through Learn, exports, and restores after refresh.

## Priority Fixes

1. Keep `brain-first.spec.cjs` and `yc-recording.spec.cjs` green before recording.
2. Keep local fallback dev-only; production/staging must use real Postgres.
3. Keep backend Create Canvas snapshot coverage green; later merge it with a broader session canvas if cross-mode history becomes necessary.
4. Keep quick-note-to-memory promotion server-owned and covered by the Brain-first e2e.
5. Do not demo live Gmail, SMS/iMessage, Slack, Drive, or Calendar until their proof bundles pass.
