# AGENTS.md

Canonical instructions for agents and humans working in this repo. `CLAUDE.md`
points here; keep guidance in one place.

## What prosodio is

A Bun monorepo for managing, aligning, and playing audiobooks alongside their
ebooks on a synchronized timeline. Consolidated from scattered experiments; see
`thoughts/plans/` for the migration plan once seeded.

## Public/private boundary

- The repo is **public** (MIT). Source, fixtures, and generated public artifacts
  are committed.
- Real corpora and any identifying reports stay **private** in gitignored
  locations. Never commit a real audiobook/ebook or a report naming one.

## Working rules

- Configs are **generated** (`bun init`, `bun add`), never hand-written. Versions
  come from the registry, never invented.
- Libs export raw `.ts` (no build step); `workspace:*` for internal deps.
- Run `bun run ci` before committing.
- Small, reviewable commits — keep state trackable at every step.

## Where things live

- `packages/` logic libs · `components/` React UI · `apps/` runnables
- `docs/` durable reference · `thoughts/` plans, research, tickets, reviews
- `fixtures/` committed public test data · `data/` gitignored private corpora
