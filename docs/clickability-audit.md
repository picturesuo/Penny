# Clickability Audit

Date: May 23, 2026

## Verdict

FAIL.

The visible YC fixture path can still reach Create, Learn, and export, but the normal Brain-first path is broken on the current localhost server. The hardest blocker is `/api/brain/recents`: quick notes and saved Brain objects call the DB-backed Brain objects route, which throws when `DATABASE_URL` is empty. Brain memory import has an in-memory dev fallback; Brain recents/objects do not.

## Audit Commands

- Server already running on `http://localhost:3007` with `DATABASE_URL=` and `PENNY_SKIP_DATABASE_PREP=true`.
- Live visible-control sweep from the public landing page with a temporary Playwright spec.
- Direct API check: `POST /api/brain/recents` returned `500` with `DATABASE_URL is required to create the Penny database client.`
- Direct API check: `POST /api/brain/import` returned `200` and imported source-backed memories.
- Gmail status check: Gmail is unconfigured and reports missing `NANGO_PUBLIC_KEY` and `NANGO_GMAIL_INTEGRATION_ID`.
- Existing YC e2e check: `PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --reporter=line --output=.tmp-yc-recording-check` passed in 3.0s. This does not prove the Brain-first path.

## Control Findings

| Surface | Control | Expected | Actual | Root cause | Fix |
| --- | --- | --- | --- | --- | --- |
| Landing | Start with your Brain | Open Brain from a fresh public landing page. | Works; Brain workspace becomes visible. | `LandingPage` calls `onModeSelect("Brain")`. | Keep. Add e2e coverage that does not jump to internal routes. |
| Landing | Start Create | Load fixture and open Create. | Works; existing YC e2e passes. | Fixture import uses Brain memory route, which has in-memory fallback. | Keep as demo shortcut, but do not treat as proof of the Brain-first product loop. |
| Brain | Quick Note send | Save a visible, persisted quick note row. | Fails on current localhost; no row appears. Direct API returns `500`. | `brain-objects-route.ts` resolves default service with `createPennyDb()` and no `DATABASE_URL`; no in-memory dev fallback. | Add in-memory Brain objects/recents service for local dev or start normal localhost with a real DB. Surface API errors beside the quick note form. |
| Brain | Quick Note Save to Brain | Promote a quick note into Brain memory/document state. | Not reachable after send failure. Code saves a Brain object only, not Brain memory/profile. | Same DB route failure; even success would not refresh documents/profile or create memory nodes. | Persist quick notes into a real Brain item and refresh docs/memory counts. |
| Brain | New Document | Open editor/creation surface inside Brain. | Fails; sidebar button navigates back to landing. | `BrainSidebar` receives `onNewDocument={onNewThought}`; `handleNewThought` resets app to landing. | Replace with a Brain-local document editor/seed focus. Keep logo reset separate. |
| Brain | Start a document form | Create a persisted Brain document from typed thought. | Code path is real via `handleSeed`, but not reached by the misleading New Document button. | The real creation UI is a form in the index, separate from the sidebar command. | Make New Document focus/open this form or a document editor. |
| Brain | Add Folder | Create a folder or clearly disable it. | A folder appears, but it is local React state only and is lost on refresh. | `BrainSidebar` stores `localFolders`, renames, and document drops in component state. | Persist folders and document-folder assignment, or disable and label `not in demo`. |
| Brain | Import Context | Import pasted context and show source-backed memories. | Works on current localhost; import completed and memory/source counts updated. | Brain memory route has explicit in-memory dev fallback. | Keep, then assert refresh behavior. Align recents/objects with this route's fallback model. |
| Brain | Review Brain Profile | Mark profile review complete. | Passive checklist/profile view only; no explicit review control. | `brainFirstRunSteps` infers "Review Brain profile" from profile sections, not user action. | Add an explicit review/confirm profile control or remove it from the checklist. |
| Brain | Confirm memory | Update memory review state. | Works in code and UI shows a notice; audit locator hit multiple matching status elements. | Icon-only button calls `reviewBrainMemory(node.id, "correct")`; notice text is non-unique. | Add stable labels/test ids after behavior; show one clear live region. |
| Brain | Boost memory | Increase memory importance. | Works in code and UI shows a notice; same status text ambiguity. | Icon-only button calls `reviewBrainMemory(node.id, "boost")`. | Same as above; add visible state change such as boosted label/weight. |
| Brain | Forget memory | Remove memory from retrieval. | Button is wired in code but was not destructive-clicked in this sweep. | Icon-only button calls `reviewBrainMemory(node.id, "forget")`; no confirmation. | Add confirmation or undo, then test the visible node removal/count decrease. |
| Brain | Start Create With This Brain | Open Create carrying actual Brain context. | Works; Create opens with Brain context and memory/source counts. Rough idea is empty. | `handleStartCreateWithBrain` sets `createBrainProfile` but `createInitialSeedText=null`. | Carry a selected note/document or prompt user in-place; do not start a blank Create loop. |
| Brain | Export Coding Prompt | Export a coding prompt from the Brain flow. | Missing; only checklist text says "Export coding prompt." | No Brain export control is rendered. Export exists only inside Create after artifact generation. | Add a real Brain-to-export route or remove this checklist item until Create export exists. |
| Brain | Gmail disabled copy | Show honest Gmail unavailable/privacy state. | Works; status says unconfigured with missing Nango config and privacy copy says consent/no human review/trainingUse=false/delete-revoke. | Gmail connector status route reports gated/unconfigured state. | Keep. Ensure button remains disabled unless config is present. |
| Create | Brain pill/button | Return to Brain from Create. | Works when scoped to Create sidebar/header; global role query is ambiguous because many controls include "Brain". | Multiple visible buttons/text include "Brain"; accessible names are not unique. | Add a unique `aria-label`, e.g. `Open Brain from Create`. |
| Create | Step nav | Move between Rough idea, Five directions, Judgment, Prompt artifact, Verification, Export. | Fails as navigation; list is static. | `CreatePathSidebar` renders `<li>` items, no buttons or handlers. | Make steps clickable/focusable, or present as progress only. |
| Create | Rough idea textarea | Editable idea input. | Works. | Local state `draftText`. | Persist draft when Create is started from Brain. |
| Create | Generate control | Generate five directions from current prompt and Brain context. | Works; five cards appear. | `handleGenerateDirections` calls `/api/create/next`. | Keep; assert five lens labels every run. |
| Create | Option cards | Toggle Personal, Practical, Valuable, Critical, Weird selections. | Works; selected cards update state. | `toggleOption` updates local `selectedOptionIds`. | Persist selected IDs with the Create artifact/session. |
| Create | Evidence chips/details | Open readable source and memory evidence. | Works through `Details` drawer, not chips. | Option card details button opens `CreateOptionDetailsDrawer`. | Rename requirement/UI consistently: either chips or details. |
| Create | Comment | Save user judgment comment. | Works only after `Update artifact`; before that it is local state. | `userComment` is local until `/api/create/next` records a judgment. | Autosave draft or clearly require Update artifact. |
| Create | Artifact | Visibly change based on selected cards and comment. | Works; artifact text updates after selections/comment. | `/api/create/next` returns updated artifact and verification. | Keep; add refresh persistence assertion. |
| Create | Learn this | Open Learn from a technical Create option. | Works; Learn opens focused explanation and Back to Create preserves state while Create remains mounted. | `onLearnThis` sets `learnFocusNode` and switches mode. | Persist Create state so refresh/back survives remount, not just hidden component state. |
| Learn | Explain simply / worked example / applies to artifact | Each choice changes visible lesson content. | Works in the Create Learn bridge path. | `LearnWorkspace` builds three focused steps for the Create bridge node. | Keep; assert content changes in the real e2e. |
| Learn | Back to Create | Return with prompt/sources/selections/comment/artifact/evidence preserved. | Works without refresh because Create stays mounted and hidden. | `shouldRenderCreateWorkspace` keeps component mounted. | Persist the state; hidden mounted state is not enough for refresh. |
| Create | Canvas | Show Brain sources -> Create options -> Learn explanation -> Artifact/export. | Partial/fake; sidebar shows a static `YC demo Canvas` list. No reachable interactive Canvas from Create. | `CreatePathSidebar` renders hard-coded `ycDemoCanvasNodes`; Brain has the real Canvas workspace. | Add real Create Canvas/export view sourced from Brain/Create/Learn state. |
| Create | Export | Produce copyable prompt/spec text. | Works after artifact generation; textarea fallback is present. | `handleExportPrompt` calls `/api/create/export-coding-prompt`. | Add copy button with textarea fallback, and cover it from the Brain-first path. |

## Immediate Failure Chain

1. Fresh landing -> Brain works.
2. Quick Note send calls `POST /api/brain/recents`.
3. The server returns `500` because `DATABASE_URL` is empty.
4. No quick note row appears, so Save to Brain, Create-from-note, Learn-from-note, and archive/restore cannot be trusted.
5. The separate Brain memory import path works, which is why the fixture path can still look successful.

## Priority Fixes

1. Add a local dev in-memory fallback for Brain objects/recents/session notes, or require a DB-backed localhost startup before rendering Brain controls.
2. Replace Brain sidebar New Document reset with a real Brain document editor/focus.
3. Persist or disable folders.
4. Start Create from a selected Brain note/document or require rough idea entry with visible state; do not silently open blank Create.
5. Replace static Create Canvas with real graph/export state.
6. Rewrite e2e around the Brain-first loop and refresh checks, not only the fixture shortcut.
