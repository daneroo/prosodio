# File layout

- Code
  - `packages/` — logic libs
  - `components/` — React UI (kept apart so Tailwind `@source` stays clean)
  - `apps/` — runnables
  - `scripts/` — repo-level dev/maintenance scripts (e.g. fixtures fetch +
    sha256 verify + derive)
- Docs
  - `docs/` — durable reference (this set)
  - `thoughts/` — `BACKLOG.md` (persistent) + transient plans/notes; see
    [WORKFLOW.md](WORKFLOW.md)
- Data
  - `fixtures/` — public test data (committed, reproducible — see `scripts/`):
    - `audio/` — small smoke clips + produced `.m4b`
    - `audiobooks/<Author - Title>/` — the `.epub` (committed) beside its large
      `.m4b` (gitignored, refetched)
  - `reports/` — generated artifacts (committed; may not exist yet)
  - `data/` — gitignored, volatile. One tree per app: `data/<app>/<category>`
    (e.g. `data/transcribe/{cache,work,output,models}`), anchored by that app's
    `lib/config.ts` so the layout cannot drift
  - external — private corpora (outside the repo, via config)
