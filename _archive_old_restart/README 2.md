# Archive README 2 Task Artifact

Artifact ID: `ARCHIVE-README-2-FIRST-ARTIFACT`
Target file: `_archive_old_restart/README 2.md`
Role: `BACKEND`
Queue item: `Initialize the first real task artifact.`
Status: `initialized`

## 1. Goal

- G1: Initialize this named target as an explicit task artifact for the current queue item.
- G2: Keep `_archive_old_restart/` clearly marked as historical reference material, not the active Penny implementation surface.
- G3: Preserve the current Penny product truth while avoiding new runtime, schema, API, frontend, or package changes.

## 2. Scope

- SP1: In scope: this target file and shared-context status notes for the current BACKEND pass.
- SP2: In scope: replacing the stale duplicate archive README copy at this exact path with artifact metadata and execution criteria.
- SP3: Out of scope: root `README.md`, active app/server code, package configuration, migrations, tests, queue cleanup, and broad archive normalization.
- SP4: Out of scope: promoting any code or docs from `_archive_old_restart/` into the active implementation.

## 3. Constraints

- CT1: Treat tracked `AGENTS.md` as the repo-local operating manual.
- CT2: Use `docs/knowledge.md` and `docs/queue.md` only as local context sources for this pass.
- CT3: Do not sweep unrelated untracked files from `_archive_old_restart/` or the repo root into this artifact.
- CT4: Do not imply this archived target is the active product README or source of current runtime behavior.
- CT5: Keep the change documentation-only and path-limited to the named target for repo-visible output.
- CT6: If published, commit and push the target-file change to `origin/main` after verification.

## 4. Success Criteria

- SC1: This file declares artifact ID `ARCHIVE-README-2-FIRST-ARTIFACT`.
- SC2: This file includes Goal, Scope, Constraints, Success Criteria, Invariants, Failure Modes, Risks / Open Questions, Test Mapping, and Status sections.
- SC3: This file names the active queue item `Initialize the first real task artifact.` and the exact target path.
- SC4: This file states that `_archive_old_restart/` is historical reference material and not the active implementation surface.
- SC5: This file makes no runtime, schema, API, frontend, or package claims beyond the documentation-only artifact setup.
- SC6: The repo-visible target-file change is whitespace-clean, committed on `main`, and pushed to `origin/main`.

## 5. Invariants

- INV1: `AGENTS.md` remains the canonical repo-local operating manual.
- INV2: The shared context file remains the durable task artifact for current-task state.
- INV3: Penny remains a controllable thinking instrument, not a generic chatbot, note app, or broad document-ingestion product.
- INV4: Backend remains the canonical owner of graph state; archived README text must not cause the frontend to invent graph edges or source-of-truth state.
- INV5: Unrelated untracked archive files remain untouched unless a later task names them explicitly.

## 6. Failure Modes

- FM1: The target stays a duplicate product README and fails to initialize a task artifact.
- FM2: The artifact implies archived code is active and causes later work to use stale implementation surfaces.
- FM3: Cleanup sweeps unrelated archive files into a commit.
- FM4: The pass claims runtime verification for a documentation-only change.
- FM5: The artifact changes Penny's product identity away from the seed -> challenge/verify -> learn -> artifact loop.

## 7. Risks / Open Questions

- R1: The archive directory contains many unrelated untracked duplicates, so path-specific staging is required.
- R2: This target was initially observed as a duplicate of neighboring archive README files, then was absent immediately before creation; later roles should re-check path state before assuming archive duplicates are stable.
- Q1: Should a later cleanup task remove or ignore the remaining duplicate archive README copies instead of tracking them?

## 8. Test Mapping

- TM1: `SC1` -> inspect this file's top metadata for `ARCHIVE-README-2-FIRST-ARTIFACT`.
- TM2: `SC2` -> inspect this file for the required artifact sections.
- TM3: `SC3` -> inspect this file's top metadata and Scope for the queue item and exact target path.
- TM4: `SC4` -> inspect Scope, Constraints, and Invariants for the archive boundary.
- TM5: `SC5` -> confirm the diff touches only documentation text in this target file.
- TM6: `SC6` -> run `git diff --check -- '_archive_old_restart/README 2.md'`, then verify local `HEAD` matches `origin/main` after push.

## 9. Status

- ST1: On 2026-05-05, BACKEND read `AGENTS.md`, the shared context file, `docs/queue.md`, and `docs/knowledge.md` before editing.
- ST2: BACKEND classified this implementation as `tiny`.
- ST3: BACKEND observed `docs/queue.md` still lists `Initialize the first real task artifact.` under `Now`.
- ST4: BACKEND initially observed this target as an untracked duplicate of neighboring archive README files; immediately before creation, the exact target path was absent while `_archive_old_restart/README.md` and `_archive_old_restart/README 3.md` remained present.
- ST5: BACKEND initialized this target as a documentation-only task artifact and did not touch runtime code, active docs, queue files, knowledge files, or neighboring archive README copies.
- ST6: Verification and publication status are recorded in the shared context for this pass.
