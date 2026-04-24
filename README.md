# Penny

Fresh minimal monorepo restart for Penny.

## Workspace

- `apps/web`: Next.js App Router frontend
- `apps/api`: Fastify backend
- `packages/shared`: shared TypeScript types
- `docs/architecture.md`: current architecture notes
- `docs/setup.md`: local setup instructions

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
```

## Default local URLs

- Web: `http://localhost:3000`
- API: `http://localhost:3001/health`
