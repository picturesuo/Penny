# AI Services

This folder is the service-layer home for Penny AI orchestration.

Use it for backend-owned AI service modules that coordinate existing AI contracts,
operations, persistence bridges, tracing, and job/command boundaries. Keep provider
transport in `server/ai/providers/**`, prompt assembly in `server/ai/prompts/**`,
schema validation in `server/ai/schemas/**`, and domain writes/events in backend
commands or jobs.

Current backend structure:

- `server/ai/contracts/**`: typed operation and persistence contracts.
- `server/ai/operations/**`: provider-using AI operations such as `generateChallengeCritique`.
- `server/ai/prompts/**`: versioned prompt builders.
- `server/ai/providers/**`: Anthropic/xAI transport wrappers and provider errors.
- `server/ai/providers/types.ts`: shared AI provider interface and normalized request/response/error types.
- `server/ai/providers/mock.ts`: deterministic mock provider for tests and no-key local flows.
- `server/ai/routing/**`: model policy and provider route selection.
- `server/ai/schemas/**`: structured output validation.
- `server/ai/tracing/**`: Langfuse tracing helpers.

Current service foundation:

- `operation-names.ts`: canonical MVP AI operation names.
- `prompt-version-seeds.ts`: seed records for the first `prompt_versions` row for each MVP operation.
- `ai-job.ts`: repository-shaped helper for creating queued jobs and marking them succeeded or failed.

Initial service rule: do not add a new service until it has a narrow caller and a
testable boundary. The first expected service should wrap challenge critique
generation without moving provider-specific logic or prompt text into this folder.
