# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

prosodio is a Bun monorepo for managing, aligning, and playing audiobooks
alongside their ebooks on a synchronized timeline.

## Quality

- `bun run ci` — after every edit, before every commit
- `bun run fmt` — fix formatting when `ci` fails

## Layout

- `packages/` — logic libs
- `components/` — React UI
- `apps/` — runnables
- `docs/` — reference
  - `FORMATTING.md` — formatting + linting, with a reproducible proof
  - `MARKDOWN.md` — markdown authoring style
  - `CODING-STYLE.md` — code conventions
- `thoughts/` — plans, research, tickets, reviews
- `fixtures/` — public test data (committed)
- `reports/` — generated artifacts (committed)
- `data/` — gitignored, volatile (outputs, scratch)
