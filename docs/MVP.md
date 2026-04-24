# Penny MVP

## Locked Checklist

The Penny MVP is locked to these user-visible capabilities:

- [ ] Capture thought
- [ ] Extract claims
- [ ] Visualize graph
- [ ] Inspect node
- [ ] Rate confidence
- [ ] Search with Cmd+K
- [ ] Challenge idea
- [ ] Learn blocker

## Lock Rules

- New work should map to one of the checklist items unless it is a bug fix, test, or small infrastructure task required to ship an item.
- Do not expand the MVP checklist without explicitly updating this file.
- Keep implementation scope tight: projection-backed UI, typed API contracts, and focused tests over broad product polish.

## Freeze Policy

Status: frozen for v0 MVP.

Allowed changes after freeze:

- Fix blockers that prevent one of the locked checklist items from working.
- Fix failing typecheck, build, or MVP verification tests.
- Fix security, ownership, data-loss, or startup issues that affect the MVP path.
- Update release notes, test docs, or version metadata needed to ship v0 MVP.

Do not start new feature development until v0 MVP is tagged.

## Release Target

- Intended tag: `v0-mvp`
- Tag only from a verified commit that contains this checklist and passes the MVP verification commands.

## Verification

Last verified: 2026-04-24.

- `pnpm typecheck` passed.
- `pnpm test:mvp` passed: 14 tests.
- `pnpm test:mvp-verification` passed: 106 tests.
