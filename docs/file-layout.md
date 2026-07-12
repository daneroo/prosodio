# File layout

- Code
  - `packages/` — logic libs
  - `components/` — React UI (kept apart so Tailwind `@source` stays clean)
  - `apps/` — runnables
  - `scripts/` — repo-level dev/maintenance scripts (e.g. fixtures fetch +
    sha256 verify + derive)
- Docs
  - `docs/` — durable reference (this set)
  - `thoughts/` — `BACKLOG.md` (persistent) + transient work; see
    [workflow.md](workflow.md)
    - `plans/<id>.md` — executable checkbox plan
    - `plans/archive/<id>.md` — completed plans kept while still useful (e.g. as
      exemplars or referenced by live backlog items); removed eventually. The
      backlog is the durable record, not these.
    - `design/<id>-design.md` — preferred name for the plan's working design
    - `research/`, `reviews/`, `tickets/` — optional supporting notes
- Data (what may be committed vs kept private: [privacy.md](privacy.md))
  - `fixtures/` — public test data (committed, reproducible — see `scripts/`):
    - `audio/` — small smoke clips + produced `.m4b`
    - `audiobooks/<Author - Title>/` — the `.epub` (committed) beside its large
      `.m4b` (gitignored, refetched)
    - `transcriptions/<Author - Title>.vtt` — committed public VTT fixtures
      paired with books under `audiobooks/`
  - `data/` — gitignored, volatile. One tree per app: `data/<app>/<category>`
    (e.g. `data/transcribe/{cache,work,output,models}`), anchored by that app's
    `lib/config.ts` so the layout cannot drift
  - external — private corpora (outside the repo, via config)
