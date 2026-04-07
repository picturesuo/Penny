# Penny

Penny is a brutally honest AI cofounder for early-stage founders. It pressure-tests vague startup ideas, extracts assumptions and risks, adds lightweight context, and ends with a Founder Concept Brief plus next validation steps.

## Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma ORM
- SQLite for local development

## What is implemented

- Marketing landing page with product positioning
- Authenticated-style app shell for a demo founder
- Dashboard with seeded sessions
- New idea flow
- Stateful session workspace with two-pane layout
- Stage tracking, question budget, weakest-assumption pressure, and logic-only fallback
- Session persistence and resume flow
- Founder Concept Brief generation
- Prompt templates under [`prompts/`](/Users/bensuo/Desktop/penny/prompts)

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create and migrate the local database:

```bash
npm run db:migrate
```

3. Seed demo sessions:

```bash
npm run db:seed
```

4. Start the app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Notes

- The current LLM and evidence layers are provider-agnostic abstractions backed by mock adapters so the product works end-to-end without external API keys.
- The evidence service intentionally stays lightweight. If retrieval fails, the app falls back to logic-only mode and continues the session.
- The Prisma client is generated automatically by Prisma commands using the standard `@prisma/client` package.
