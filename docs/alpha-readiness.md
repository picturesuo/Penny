# Private Alpha Readiness

This is the current private-alpha operating checklist for Penny's Brain -> Create -> Export path.

## Alpha Flow

1. Open Brain.
2. Import context in Second Brain memory:
   - ChatGPT export ZIP.
   - ChatGPT `conversations.json`.
   - Claude JSON, CSV, markdown, or copied text.
   - Plain text, markdown, CSV, copied docs text, copied canvas text.
   - Already-extracted PDF text.
3. Review the Brain profile:
   - Confirm the source count and memory count.
   - Read `Penny understood`.
   - Mark memories correct, boost important memories, mark wrong memories, or forget memories.
   - Confirm every memory shows source/evidence metadata and `no global training` copy.
4. Start Create from Brain with `Use this Brain to create something`.
5. Generate Create directions:
   - Confirm five cards exist: Personal, Practical, Valuable, Critical, Weird.
   - Confirm one Brain Ranker next-best move appears above the cards.
   - Check memory/source counts on cards.
   - Confirm each card shows a plain-language top reason and grounding label.
   - Open details to see why memories/sources were used and what is uncertain.
6. In dev/test only, run provider comparison:
   - Compare deterministic vs model-backed/fallback cards.
   - Inspect provider mode, schema validation, fallback reason, memory/source counts, verification scores, and prompt quality signals.
7. Select multiple cards and add a judgment comment.
8. Update the artifact.
9. Export the coding-agent prompt.
10. Confirm the export includes product goal, rough idea, user intent, personal context, source/memory evidence, selected option history, non-goals, UX/frontend/backend/data/privacy/verification requirements, implementation sequence, acceptance tests, do-not-break list, and definition of done.

## Required Environment

Local development:

```sh
DATABASE_URL=postgresql://127.0.0.1:5432/penny
PENNY_AUTH_MODE=dev
PENNY_CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
PENNY_CREATE_MODEL_BACKED=false
```

Private alpha or staging:

```sh
NODE_ENV=production
PENNY_DEPLOY_ENV=private-alpha
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<32+-character-random-token>
PENNY_SESSION_SECRET=<32+-character-random-secret>
PENNY_CORS_ORIGINS=https://<alpha-host>
PENNY_RATE_LIMIT_MAX=120
PENNY_RATE_LIMIT_WINDOW_MS=60000
PENNY_AUTH_FAILURE_RATE_LIMIT_MAX=10
PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS=60000
PENNY_TRUST_AUTH_HEADERS=false
PENNY_STRUCTURED_LOGS=true
PENNY_CREATE_MODEL_BACKED=false
```

Optional model-backed Create:

```sh
PENNY_CREATE_MODEL_BACKED=true
XAI_API_KEY=<xai-key>
XAI_CREATE_OPTION_MODEL=<optional-model-override>
```

`PENNY_CREATE_MODEL_BACKED` must stay false unless the model-backed path is intentionally being tested. When enabled, the provider uses `store: false`, strict local schema validation, deterministic fallback, and visible fallback/debug status.

## Dev And Staging Flags

- `PENNY_CREATE_MODEL_BACKED=true`: enables the xAI-backed Create option provider only when `XAI_API_KEY` is present.
- `VITE_PENNY_CREATE_COMPARE=true`: exposes the Create comparison panel outside Vite dev/test if explicitly needed for a staging judge.
- `PENNY_AUTO_MIGRATE=true`: runs Drizzle migrations at API startup. Default is enabled outside production and disabled in production unless set.
- `PENNY_SKIP_DATABASE_PREP=true`: skips startup DB prep in local/dev only. Strict deployments reject it because it bypasses schema readiness checks.
- `PENNY_STRUCTURED_LOGS=true`: emits safe JSON logs for auth failures, Brain import/retrieve/review/delete, Create generation/fallback/schema failures, and prompt export.

Strict startup validation is active when `NODE_ENV=production` or `PENNY_DEPLOY_ENV` is `staging`, `private-alpha`, or `production`. It blocks dev auth, weak or missing token/session secrets, wildcard CORS, local or non-Postgres database URLs, disabled rate limits, skipped database prep, trusted auth headers, and model-backed Create without `XAI_API_KEY`.

## Database Readiness

Brain memory persistence is backed by the Drizzle schema and migrations. The alpha-critical Brain memory migration is `drizzle/0029_add_brain_memory_persistence.sql`. Export feedback persistence is `drizzle/0030_add_create_export_feedback.sql`. Create workspace persistence for option sets, artifacts, and judgment events is `drizzle/0034_add_create_workspace_persistence.sql`. API startup verifies the required Penny tables after migrations or separate prep and fails with a `pnpm db:migrate` instruction if the schema is incomplete.

Private alpha must use Postgres. The API startup path requires `DATABASE_URL`; route-level Brain memory also refuses production in-memory fallback. In-memory Brain memory is for direct local dev/test only and is not durable.

Run before deploy:

```sh
pnpm db:migrate
pnpm check:public-readiness
pnpm smoke:public-staging
pnpm test
pnpm typecheck
pnpm build
```

`pnpm check:public-readiness` is the broad public/private-alpha gate. It queries the target
`DATABASE_URL` unless `--schema-tables-file=<file>` is supplied for offline proof. It fails unless
strict deploy validation is active, the Postgres schema exposes every required Penny table, token
auth is configured, API and auth-failure rate limits are explicit, structured logs are enabled, and
live Gmail is either disabled or backed by a verified final staging evidence bundle.

For offline schema evidence, print the exact required table list first:

```sh
pnpm --silent check:public-readiness -- --print-required-schema-tables > tmp/schema-tables.json
pnpm check:public-readiness -- --schema-tables-file=tmp/schema-tables.json
```

If live Gmail is intentionally enabled, run the public readiness gate with the same final evidence
used for the Gmail staging bundle:

```sh
pnpm check:public-readiness -- \
  --gmail-readiness=tmp/gmail-readiness-evidence.json \
  --gmail-smoke=tmp/gmail-smoke-evidence.json \
  --gmail-destructive-smoke=tmp/gmail-smoke-destructive.json \
  --gmail-ui-preflight=tmp/gmail-ui-preflight-evidence.json \
  --gmail-browser-evidence=tmp/gmail-browser-evidence.json \
  --gmail-browser-artifact-root=tmp/gmail-browser-artifacts
```

After the readiness gate passes against the target environment, run a live target smoke with a
throwaway scope and a token for the deployed Penny URL:

```sh
PENNY_PUBLIC_SMOKE_BASE_URL=https://<alpha-host> \
PENNY_PUBLIC_SMOKE_API_TOKEN=<token> \
PENNY_PUBLIC_SMOKE_RUN_ID=<safe-run-slug> \
PENNY_PUBLIC_SMOKE_EVIDENCE_FILE=tmp/public-staging-smoke.json \
pnpm smoke:public-staging
```

The public smoke checks the token-auth login gate, unauthenticated API rejection, Brain documents,
Brain memory profile, Brain recents, Create five-direction generation, Create export, and absence of
unsupported live connector claims. The evidence file stores counts, ids, lengths, and booleans only;
it does not write the API token or exported prompt text.

The Brain memory tables store scope columns on sources, chunks, nodes, edges, profile signals, ingestion jobs, and retrieval events. Brain Ranker persistence adds scoped `brain_ranker_runs`, `brain_ranked_candidates`, and `brain_development_events` for Create ranker output and learning events. Route tests cover cross-user access attempts for jobs, profiles, retrieval, memory review, source deletion, Create memory retrieval, Create artifacts, judgments, option sets, and deleted-source Create behavior.

Create uses the backend Brain Ranker progress engine. The ranker accepts retrieved Brain memory and source refs, privately scores relevance/progress dimensions, and returns one next-best move plus five ranked Create candidates. Normal user surfaces show memory/source counts, top reasons, grounding labels, and uncertainty; raw ranker scores are not shown. Context-light runs are labeled `context-light/search-needed/inferred` instead of inventing memory. In DB-backed environments, Create option sets, artifacts, and judgment events persist in scoped Postgres tables; the in-memory Create store is only for local dev/test fallback. Brain profile now surfaces active projects, idea clusters, high-value memories, stale/superseded memories, and recent meaningful activity alongside recurring interests, taste, build style, frustrations, and rejected directions.

## Privacy Checks

- Imported sources are private to the authenticated Penny scope.
- Source permissions default to `visibility=private`, `trainingUse=false`, and allowed uses `private_memory` plus `create_retrieval`.
- Retrieval returns source references and memory references so the user can see why a memory was used.
- Brain Ranker reasons cite only supplied or retrieved memory/source refs.
- Development events record source imports, memory extraction/review, memory used in Create, option selection/rejection, prompt exports, export feedback, and direction changes; explicit user actions weigh above implicit extraction or use.
- Deleting a source removes related chunks, memory nodes, edges, and Create retrieval grounding.
- Create must not invent Gmail, Slack, messages, OAuth, hidden memory, global training, or fake source claims.
- Exported prompts must repeat the source/memory evidence actually used and must not imply broader ingestion.
- Structured logs must show status/counts/ids only, not imported text, retrieval queries, prompt text, comments, excerpts, tokens, or secrets.
- Create export feedback must be scoped to user/workspace/project/sphere and store only rating, reason tags, optional clipped comment, ids, and prompt completeness score.

## Error And Empty States

- No memory: Brain says no private user memory has been imported, and Create labels the run context-light.
- Import failed: Brain shows the last failed import and the parser guidance.
- Unsupported file: ZIP/PDF errors explain which text forms are supported.
- Model-backed failed: Create shows deterministic fallback, schema status, schema errors, and fallback reason.
- Deleted source: Brain shows that related source-backed memories were removed from retrieval and Create.
- No relevant memory found: Create cards and details say context-light and only the rough idea is grounded.
- Export failed: Create shows a retryable failure panel and keeps the current artifact visible.
- Export feedback failed: Create shows the error without changing the exported prompt.

## Unsupported Imports

Unsupported for private alpha:

- Gmail, Slack, iMessage/messages, or broad OAuth connectors.
- Raw scanned PDF/OCR.
- Full document-ingestion pipelines.
- Background global memory import.
- Any source that cannot provide readable text or explicit user permission.

For PDFs, paste selectable text or run OCR outside Penny and import the extracted text.

## Known Limitations

- Browser-side Create draft restore still uses local storage for recording ergonomics; the backend now persists option sets, judgments, and artifacts in strict DB-backed environments.
- The comparison panel is a dev/test judge tool, not a normal user feature.
- Model-backed Create is opt-in and should remain off for first private-alpha runs unless actively evaluated.
- Brain import uses local parsing heuristics and strict file-size limits; very large exports should be reduced before import.
- Dogfood import limits reject normalized imports above 650,000 characters, imports above 450 chunks, ZIPs with more than 200 files, and ZIP text entries above 650,000 characters.
- Search is Penny-native lexical/graph-oriented; embeddings and broad semantic memory remain post-MVP.

## Acceptance Gate

The private-alpha path is acceptable only when:

- A user can complete Brain import -> profile review -> Start Create -> options -> judgment -> export.
- Memory/source provenance is visible before export.
- Cross-user and deleted-source leakage tests pass.
- Production cannot silently use in-memory Brain memory.
- Model-backed failures safely fall back and are visible.
- Export feedback is captured after prompt export.
- Structured logs are enabled and privacy-audited.
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
