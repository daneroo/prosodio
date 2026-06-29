# File layout

- Code
  - `packages/` — logic libs
  - `components/` — React UI (kept apart so Tailwind `@source` stays clean)
  - `apps/` — runnables
- Docs
  - `docs/` — durable reference (this set)
  - `thoughts/` — `BACKLOG.md` (persistent) + transient plans/notes; see
    [WORKFLOW.md](WORKFLOW.md)
- Data
  - `fixtures/` — public test data (committed)
  - `reports/` — generated artifacts (committed; may not exist yet)
  - `data/` — gitignored, volatile (outputs, scratch)
  - external — private corpora (outside the repo, via config)
