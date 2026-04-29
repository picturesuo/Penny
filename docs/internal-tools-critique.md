# Internal Tools Critique

Status: Wave 7 CRITIC  
Date: 2026-04-29  
Artifact ID: `INTERNAL-TOOLS-CRITIQUE`

## Scope

Reviewed the MCP-shaped internal tool layer only:

- `packages/brain/src/tools/internal-tool-registry.ts`
- `packages/brain/src/internal-tool-registry.test.ts`
- `packages/brain/src/services/thinking-mode-service.ts`
- `packages/brain/src/services/challenge-service.ts`
- `packages/brain/src/services/challenge-brief-service.ts`
- `packages/brain/src/server.ts`
- `package.json`
- `docs/thinking-mode-autopilot-spec.md`
- `docs/knowledge.md`

## Verdict

`APPROVED WITH RISKS`

This is an internal in-process adapter over existing Thinking Mode services. It does not add a public MCP server, public routes, network transport, auth surface, package dependency, database table, migration, or frontend product surface.

## Criterion Judgments

| Criterion | Judgment | Artifact mapping |
| --- | --- | --- |
| 1. It reuses existing services. | PASS | `INTERNAL-TOOLS-CRITIQUE-C1` |
| 2. It does not become the product. | PASS | `INTERNAL-TOOLS-CRITIQUE-C2` |
| 3. It does not add public server complexity. | PASS | `INTERNAL-TOOLS-CRITIQUE-C3` |
| 4. It makes future agent integration easier. | PASS WITH RISKS | `INTERNAL-TOOLS-CRITIQUE-C4` |

## Findings

### `INTERNAL-TOOLS-CRITIQUE-F1`: tool handlers delegate to the existing services

Maps to: `INTERNAL-TOOLS-CRITIQUE-C1`

`createPennyInternalToolRegistry` receives injected `thinkingModeService`, `challengeRoundService`, and `challengeBriefService` instances. Its seven handlers call the existing service methods:

- `getState`
- `tick`
- `startCandidate`
- `manualFocus`
- `issueChallengeFromCandidate`
- `respondToChallenge`
- `generateChallengeBrief`

The focused test confirms each tool calls the expected fake service method with validated input. This is the right architecture: the tools are not a second Thinking Mode implementation.

Judgment: `PASS`.

### `INTERNAL-TOOLS-CRITIQUE-F2`: the layer stays internal and does not become a product surface

Maps to: `INTERNAL-TOOLS-CRITIQUE-C2`

The tool registry lives under `packages/brain/src/tools/` and is not imported by the frontend, app shell, or `packages/brain/src/server.ts`. There is no UI, no chatbot sidebar, no agent-facing product copy, and no broad feature expansion. The tool names mirror the already-built first loop rather than inventing new capabilities.

The main product risk is naming gravity: once a tool list exists, future work may be tempted to treat "agent integration" as the product. For now, the implementation remains a backend adapter around Brain, Autopilot, Challenge, and Challenge Brief services.

Judgment: `PASS`.

### `INTERNAL-TOOLS-CRITIQUE-F3`: no public MCP or server complexity was added

Maps to: `INTERNAL-TOOLS-CRITIQUE-C3`

Repo inspection found no MCP transport, no JSON-RPC or SSE server, no new HTTP route, no auth/rate-limit path, no package dependency, no schema migration, and no server wiring for this registry. `git show --stat 558d840` shows only two files changed: the internal registry and its focused test.

That matches the constraint: internal MCP-shaped tools only after the core loop exists, without building public MCP yet.

Judgment: `PASS`.

### `INTERNAL-TOOLS-CRITIQUE-F4`: schemas make future integration easier but are now a drift point

Maps to: `INTERNAL-TOOLS-CRITIQUE-C4`

The registry has the right primitives for future agents: stable tool names, descriptions, strict Zod input schemas, strict Zod output schemas, a runner, unknown-tool rejection, input validation before service calls, and output validation after service calls.

The risk is that the output schemas duplicate service DTO shapes by hand. If `ThinkingModeCandidateDto`, `ChallengeRoundDto`, or `ChallengeBriefResponse` changes, the tool schemas can reject valid service output or silently lag the canonical API contract. This is especially likely around next-move action names and Challenge Brief sections.

Required fix before making this a durable agent contract: add either DTO-derived schema exports from the service layer or a focused regression test that runs representative real service outputs through every tool output schema, including `create_challenge_brief`/artifact-boundary flows if those are exposed through the active Thinking Mode service.

Judgment: `PASS WITH RISKS`.

### `INTERNAL-TOOLS-CRITIQUE-F5`: tools lack side-effect metadata for safe agent planning

Maps to: `INTERNAL-TOOLS-CRITIQUE-C4`

Descriptions mention side effects, but the registry does not expose machine-readable metadata such as `readOnly`, `mutates`, `createsMoveKinds`, `requiresExplicitUserIntent`, or `idempotency`. Future agents can call the tools, but they cannot yet reason safely about which calls mutate canonical state.

This does not block Wave 7 because the tools remain internal and command-shaped. It should be fixed before exposing the registry to autonomous or external agents.

Judgment: `PASS WITH RISKS`.

## Verification

- `PASS`: `pnpm exec tsx --test packages/brain/src/internal-tool-registry.test.ts`
- `PASS`: `pnpm typecheck`
- `PASS`: `rg` inspection found no `internal-tool-registry` imports outside the registry and its test.
- `PASS`: `rg` inspection found no new public MCP/server route wiring.
- `PASS`: `git status --short --branch --untracked-files=all` was clean before writing this critique.

## Required Before Public Agent/MCP Exposure

1. Add machine-readable side-effect metadata to each tool.
2. Reduce schema drift by deriving or co-locating service DTO schemas.
3. Keep this registry in-process until auth, rate limiting, audit logging, and explicit external-agent policy exist.

## Status

`APPROVED WITH RISKS`

Wave 7 can proceed as an internal adapter. It should not be presented as public MCP, a product surface, or an autonomous agent layer yet.
