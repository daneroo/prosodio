# File layout

- Code
  - `packages/` — logic libs
  - `components/` — React UI (kept apart so Tailwind `@source` stays clean)
  - `apps/` — runnables
  - `scripts/` — repo-level dev/maintenance scripts (e.g. fixtures fetch +
    sha256 verify + derive)
- Docs
  - `docs/` — durable reference (this set)
    - `agents/` — issue tracker, triage labels, domain-doc rules for the agent
      skills
    - `adr/` — hard-to-reverse decisions (created when the first one is needed)
  - `GLOSSARY.md` — domain glossary at the root (created when the first term is
    resolved)
  - `thoughts/` — `BACKLOG.md` (persistent idea inbox) + transient companion
    files for GitHub issues; see [workflow.md](workflow.md)
    - `plans/<issue#>-<slug>.md` — live checkbox plan
    - `plans/archive/` — closed plans kept while still useful as exemplars;
      removed eventually
    - `design/`, `research/`, `reviews/` — `<issue#>-<slug>.md`
    - `tickets/` — legacy notes from the pre-GitHub workflow; migrating to
      issues
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
