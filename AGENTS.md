# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

prosodio is a Bun monorepo for managing, aligning, and playing audiobooks
alongside their ebooks on a synchronized timeline.

## Quality

- `bun run ci` — after every edit, before every commit
- `bun run fmt` — fix formatting when `ci` fails

## Execution

For coding tasks, use your judgement: when delegation is worthwhile, pick a
lower-power model and effort level and run the task in a subagent — trivial
edits are cheaper done directly. Plan for that delegation (boundaries,
acceptance criteria) — see the Plan section of
[docs/workflow.md](docs/workflow.md).

## Layout

- Code
  - `packages/` — logic libs
  - `components/` — React UI
  - `apps/` — runnables
- Docs
  - `docs/` — durable reference (index: [docs/README.md](docs/README.md))
  - `thoughts/` — plans, designs, research, tickets, reviews
- Data
  - `fixtures/` — public test data (committed)
  - `data/` — gitignored, volatile (outputs, scratch)
  - external — private corpora (outside the repo, via config)
