# AGENTS.md

Canonical instructions for agents and humans. `CLAUDE.md` points here.

prosodio is a Bun monorepo for managing, aligning, and playing audiobooks
alongside their ebooks on a synchronized timeline.

## Quality

- `bun run ci` — after every edit, before every commit
- `bun run fmt` — fix formatting when `ci` fails

## Execution

- When planning, shape coding tasks so model class and effort can be selected
  per task. State the relevant context, boundaries, dependencies, risk,
  acceptance criteria, and verification.
- For coding tasks, use judgment to select an appropriate lower-power subagent
  model and effort level. Reassess the plan's recommendation when execution
  reveals additional complexity or risk.
- Keep integration, architectural judgment, and final verification with the
  coordinating agent.

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
