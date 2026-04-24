# AI Rules

These rules define Penny's first AI contract. They apply to `generateChallengeCritique` only until another operation is explicitly added.

## Core Rules

- No UI model calls. Client code must call server-owned commands, routes, or operations instead of AI providers directly.
- No raw prompts in route handlers. Prompt text and prompt payload assembly belong in `server/ai/prompts/**`.
- All AI outputs are schema-validated before they are persisted, returned, or used by downstream code.
- One repair pass max. If the repaired output still fails validation, the operation must fail with a structured error.
- Provider logic only lives in `server/ai/providers/**`. Other AI modules may select or call providers, but they must not contain provider-specific transport, auth, response parsing, or error-normalization code.

## Initial Operation

- Start with `generateChallengeCritique` only.
- The output contract lives in `server/ai/schemas/**`.
- The prompt contract lives in `server/ai/prompts/**`.
- Any additional operation needs its own schema, prompt version, and tests before it is wired into runtime code.

## Manual audit

Check for provider calls outside `server/ai`:

```bash
rg -n "invokeAnthropic|invokeXai|ANTHROPIC_API_KEY|XAI_API_KEY|api\\.anthropic\\.com|api\\.x\\.ai" . --glob '!server/ai/**' --glob '!node_modules'
```

Check for raw prompts outside `server/ai/prompts`:

```bash
rg -n "system prompt|user prompt|Return only JSON|You generate|Response format instructions" . --glob '!server/ai/prompts/**' --glob '!node_modules'
```
