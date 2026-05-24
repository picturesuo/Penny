# Functionality Proof

Date: May 23, 2026

## Verdict

PASS for the local MVP loop on `http://localhost:3007`.

A fresh browser can complete the Brain-first loop: quick note -> Save to Brain-backed private memory -> New Document -> import Brain context -> Start Create with this Brain -> five directions -> select/comment -> artifact update -> Learn this -> Back to Create -> export -> refresh restores Create state.

The standalone Learn route also proves the source-to-concept path: arbitrary source-like input opens a compact Source -> Map -> Teach -> Use -> Check tour instead of a generic lesson worksheet.

## Local Server

The verified server was running with local Postgres:

```sh
DATABASE_URL=postgresql://127.0.0.1:5432/penny PENNY_AUTH_MODE=dev PENNY_SKIP_DATABASE_PREP=true PORT=3007 pnpm dev
```

Health check:

```sh
curl -sS -I http://localhost:3007
```

Result: `HTTP/1.1 200 OK`.

## Commands Run

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local-demo -- --port 3007 --output .tmp-local-demo-smoke
PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/brain-first.spec.cjs --reporter=line --output=.tmp-brain-first
PENNY_BASE_URL=http://localhost:3007 pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --reporter=line --output=.tmp-yc-recording-check
PENNY_BASE_URL=http://localhost:3007 PENNY_PROOF_DIR=docs/proof/functionality/brain-first-screenshots PENNY_PLAYWRIGHT_SLOWMO_MS=100 PENNY_PLAYWRIGHT_VIDEO=on PENNY_PLAYWRIGHT_TRACE=on PENNY_PLAYWRIGHT_SCREENSHOT=on pnpm dlx @playwright/test test test/e2e/brain-first.spec.cjs --headed --reporter=line --output=docs/proof/functionality/brain-first-playwright-output
PENNY_BASE_URL=http://localhost:3007 PENNY_PROOF_DIR=docs/proof/functionality/screenshots PENNY_PLAYWRIGHT_SLOWMO_MS=100 PENNY_PLAYWRIGHT_VIDEO=on PENNY_PLAYWRIGHT_TRACE=on PENNY_PLAYWRIGHT_SCREENSHOT=on pnpm dlx @playwright/test test test/e2e/yc-recording.spec.cjs --headed --reporter=line --output=docs/proof/functionality/playwright-output
```

Results:

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 641 tests.
- `pnpm build`: passed.
- `pnpm smoke:local-demo`: wrapper command for the Brain-first, YC fixture, and Learn understanding browser specs.
- Brain-first e2e: passed, including refresh restore assertions.
- YC recording e2e: passed.
- Headed Brain-first proof: passed.
- Headed YC fixture proof: passed.

## Brain-First Proof Artifacts

Screenshots:

- [Landing](proof/functionality/brain-first-screenshots/000-01-landing.png)
- [Quick note saved](proof/functionality/brain-first-screenshots/000-02-quick-note-saved.png)
- [Document created](proof/functionality/brain-first-screenshots/000-03-document-created.png)
- [Imported Brain profile](proof/functionality/brain-first-screenshots/000-04-imported-brain-profile.png)
- [Create directions](proof/functionality/brain-first-screenshots/000-05-create-directions.png)
- [Selections, evidence, and comment](proof/functionality/brain-first-screenshots/000-06-selections-evidence-comment.png)
- [Artifact updated](proof/functionality/brain-first-screenshots/000-07-artifact.png)
- [Learn applies to artifact](proof/functionality/brain-first-screenshots/000-08-learn-applies.png)
- [Back to Create](proof/functionality/brain-first-screenshots/000-09-back-to-create.png)
- [Export prompt](proof/functionality/brain-first-screenshots/000-10-export.png)
- [Refresh restored Create state](proof/functionality/brain-first-screenshots/000-11-refresh-restored.png)

Trace/video:

- [Brain-first trace](proof/functionality/brain-first-playwright-output/test-e2e-brain-first-Brain-8cb85-hes-Create-Learn-and-export/trace.zip)
- [Brain-first video](proof/functionality/brain-first-playwright-output/test-e2e-brain-first-Brain-8cb85-hes-Create-Learn-and-export/video.webm)

## YC Fixture Proof Artifacts

Screenshots:

- [Landing](proof/functionality/screenshots/000-01-landing.png)
- [Fixture Create Canvas](proof/functionality/screenshots/000-02-fixture-create-canvas.png)
- [Evidence](proof/functionality/screenshots/000-03-evidence.png)
- [Selections and comment](proof/functionality/screenshots/000-04-selections-comment.png)
- [Artifact](proof/functionality/screenshots/000-05-artifact.png)
- [Learn](proof/functionality/screenshots/000-06-learn.png)
- [Return state](proof/functionality/screenshots/000-07-return-state.png)
- [Export](proof/functionality/screenshots/000-08-export.png)

Trace/video:

- [YC trace](proof/functionality/playwright-output/test-e2e-yc-recording-YC-r-1dba3--to-Create-Learn-and-export/trace.zip)
- [YC video](proof/functionality/playwright-output/test-e2e-yc-recording-YC-r-1dba3--to-Create-Learn-and-export/video.webm)

## Failures Fixed

- Brain quick notes work on the verified localhost because the server is DB-backed instead of the earlier no-DB process.
- Brain sidebar New Document no longer resets to landing; it focuses the Brain document seed form.
- Add Folder is honestly disabled and labeled as unavailable for the demo.
- Start Create with this Brain now seeds Create from the imported Brain profile instead of opening a blank Create loop.
- Create Canvas is state-backed: Brain sources, generated/selected options, Learn bridge, artifact, and export update from current state.
- Brain-first e2e starts from landing and clicks visible controls instead of jumping to internal routes.
- Create state survives refresh through a versioned Create boot record plus persisted draft state.

## Remaining Non-Demo Cuts

- Add Folder is disabled, not implemented.
- Gmail/Google surfaces remain gated unless configured; this proof does not claim Gmail or iMessage functionality.
- Local proof uses `PENNY_AUTH_MODE=dev`; real auth and rate limiting are still required before any public pitch or demo.
- Create refresh restore is browser-local continuity for the active draft. Cross-browser recovery of the exact in-progress Create workspace is not implemented.
