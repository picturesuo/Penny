# AI Rules

These rules define the initial server-side contract for AI work in Penny. This file is policy only. It does not imply the implementation already exists.

## Core rules

- No UI component calls model APIs directly.
- No route handler contains raw prompt logic unless it delegates immediately to the server AI layer.
- Every AI operation has a name, schema, prompt version, provider, and trace name.
- All AI outputs must be schema-validated before persistence.
- One repair pass max is allowed on invalid output.
- No provider-specific logic exists outside `server/ai/providers` and `server/ai/routing`.

## Initial scope

Start with one operation only:

- `generateChallengeCritique`
