# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

prosodio is a Bun monorepo for managing, aligning, and playing audiobooks
alongside their ebooks on a synchronized timeline.

## Quality

- `bun run ci` — after every edit, before every commit
- `bun run fmt` — fix formatting when `ci` fails

## Layout

- Code
  - `packages/` — logic libs
  - `components/` — React UI
  - `apps/` — runnables
- Docs
  - `docs/` — durable reference (index: [docs/README.md](docs/README.md))
  - `thoughts/` — plans, research, tickets, reviews
- Data
  - `fixtures/` — public test data (committed)
  - `reports/` — generated artifacts (committed; may not exist yet)
  - `data/` — gitignored, volatile (outputs, scratch)
  - external — private corpora (outside the repo, via config)
