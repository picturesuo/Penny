# AI Rules

These rules define the initial server-side contract for AI work in Penny. This file is policy only. It does not imply the implementation already exists.

## Core rules

- No model calls from UI.
- No raw prompt logic in route handlers.
- All outputs are schema-validated.
- One repair pass max.
- Provider-specific logic stays in `server/ai/providers` and `server/ai/routing`.

## Initial scope

Start with `generateChallengeCritique` only.

## Manual audit

Check for provider calls outside `server/ai`:

```bash
rg -n "invokeAnthropic|invokeXai|ANTHROPIC_API_KEY|XAI_API_KEY|api\\.anthropic\\.com|api\\.x\\.ai" . --glob '!server/ai/**' --glob '!node_modules'
```

Check for raw prompts outside `server/ai/prompts`:

```bash
rg -n "system prompt|user prompt|Return only JSON|You generate|Response format instructions" . --glob '!server/ai/prompts/**' --glob '!node_modules'
```
