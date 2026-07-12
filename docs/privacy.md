# Privacy — public/private data boundary

What may be committed to this public repo, and what must not. Where things live:
[file-layout.md](file-layout.md).

- Committed `fixtures/` — public test data. The location is the contract:
  placing a file under `fixtures/` declares it safe/legal to expose. Large
  binaries are fetched + verified via `fixtures/manifest.jsonc`, not committed.
- Volatile `data/<app>/…` — gitignored: outputs, caches, scratch.
- External private corpora — outside the worktree, via config (`CORPORA_DIR`,
  provisional; the shared config lib isn't promoted yet — see
  `promote-app-config` in [BACKLOG](../thoughts/BACKLOG.md)).

Rule the reports leak taught: anything derived from private corpora is itself
private — it carries filenames/metadata. No standing committed artifact dir;
promotion to public is deliberate and identity-stripping.

Private regression history: a private artifact dir may be version-tracked as a
NESTED git repo inside its gitignored folder (own `git init`, LOCAL-ONLY, never
pushed) — git history without publication. Exemplar:
`apps/epub-validate/reports/`. Regeneration must preserve the nested `.git`.
