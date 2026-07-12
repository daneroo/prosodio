# sync-repository-workflow — Back-Port Shared Workflow Refinements

Compare Prosodio's `docs/`/`thoughts/` workflow against the refinements
committed in `nix-hardy` (commit `8516003`, "Establish repository documentation
workflow") and apply the ones that improve Prosodio. This includes migrating
`docs/` filenames to lowercase kebab-case — Daniel reversed the earlier "docs/
is UPPERCASE by convention" decision on 2026-07-12: it was a mistake, and
`docs/` should match `thoughts/` (and nix-hardy). This is a docs-only ticket —
no app code changes, no behavior changes, pure renames + link updates.

Reference commits (read before starting):

- nix-hardy `8516003` — adds `AGENTS.md`, `docs/workflow.md`,
  `docs/workspace.md`, `docs/markdown.md`, `docs/README.md`, restyles
  `README.md`, and six new tickets under `thoughts/tickets/`. All of nix-hardy's
  `docs/` filenames are already lowercase kebab — that's the target casing here
  too.
- Prosodio `b384cae` — the first (partial, already-landed) backport: added the
  `## Execution` section to `AGENTS.md` and a duplicate paragraph to
  `docs/WORKFLOW.md`. Task 2 below cleans up that duplication.

## Task 1 — rename `docs/*.md` to lowercase kebab-case

Every file below EXCEPT `README.md` (the recognized-index exception, same rule
`thoughts/BACKLOG.md` already follows — see `docs/WORKFLOW.md:6-7` after Task 3
updates it):

| current                      | new                          |
| ---------------------------- | ---------------------------- |
| `docs/CODING-STYLE.md`       | `docs/coding-style.md`       |
| `docs/DEPENDENCY.md`         | `docs/dependency.md`         |
| `docs/FILE-LAYOUT.md`        | `docs/file-layout.md`        |
| `docs/FORMATTING.md`         | `docs/formatting.md`         |
| `docs/FRAMEWORK-ASTRO.md`    | `docs/framework-astro.md`    |
| `docs/FRAMEWORK-TANSTACK.md` | `docs/framework-tanstack.md` |
| `docs/LOCATE-SWEEP.md`       | `docs/locate-sweep.md`       |
| `docs/MARKDOWN.md`           | `docs/markdown.md`           |
| `docs/PRIVACY.md`            | `docs/privacy.md`            |
| `docs/STYLING.md`            | `docs/styling.md`            |
| `docs/WORKFLOW.md`           | `docs/workflow.md`           |
| `docs/WORKSPACE.md`          | `docs/workspace.md`          |

Plus one more, in a per-app `docs/` (same UPPERCASE convention, easy to miss
because it's not under the root `docs/`):

| current                                                        | new                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/epub-validate/docs/FINDINGS-epub-validate-2026-06-24.md` | `apps/epub-validate/docs/findings-epub-validate-2026-06-24.md` |

**macOS case-insensitive filesystem — verified procedure (Daniel + orchestrator,
2026-07-12).** This repo's filesystem IS case-insensitive (confirmed:
`echo hi > CaseProbe.txt; test -f caseprobe.txt` succeeds). The orchestrator
empirically tested the failure mode and the fix in three scratch git repos
before writing this — findings, not folklore:

- `git mv OLD.md new.md` as a single direct command (git's built-in rename, not
  a shell `mv`) worked cleanly in this environment: clean `R100` rename,
  survived `git commit` and a fresh `git clone` with the correct casing on disk.
- The actually-broken pattern is a raw shell `mv OLD.md new.md` followed by
  `git add -A` (or `git add .`): `git status` reported "nothing to commit,
  working tree clean" while `git ls-files` still showed the OLD uppercase name
  and the disk showed the new lowercase name — a SILENT divergence between git's
  index and the filesystem. That state looks fine locally (because the local
  filesystem is case-insensitive and resolves either name to the same file) but
  would show the file as MISSING on any case-sensitive checkout (Linux CI, a
  container, a collaborator on Linux).
- **Rule: use `git mv` for every rename in this ticket. Never use a raw shell
  `mv` for these files, even followed by `git add`.**

Even with `git mv`, use the two-hop pattern below — it costs nothing extra and
removes any doubt, since it was also verified to work cleanly (3 files renamed
this way in one pass, survived commit + fresh clone):

```sh
git mv docs/FILE-LAYOUT.md docs/file-layout.md.tmp-rename
git mv docs/file-layout.md.tmp-rename docs/file-layout.md
```

Do this pair of `git mv` commands for each of the 13 files (12 in `docs/` + the
1 `FINDINGS` file) individually. After each pair, `git status --short` should
show exactly one line, `R  <old> -> <new>` — if you instead see a separate `D`
(deleted) and `??` (untracked) line, something went wrong (likely a raw `mv`
slipped in); undo with `git checkout -- <old>` and redo with `git mv`. Once all
13 are renamed, `git diff --cached --stat` should list all 13 as clean renames
(`old => new | 0`, zero insertions/deletions), and `ls docs/` should show 12
lowercase files + `README.md`, zero uppercase.

## Task 2 — update every link and comment that names the old paths

Full inventory (verified 2026-07-12,
`grep -rlnE '\bdocs/[A-Z][A-Z0-9-]*\.md\b' . --exclude-dir=node_modules --exclude-dir=.git`
plus a check for bare relative links inside `docs/*.md` itself) — 20 files, all
plain text/comment mentions, nothing programmatic depends on these strings:

Markdown files (update the link text/path, not surrounding prose):

- `AGENTS.md`
- `thoughts/BACKLOG.md`
- `thoughts/tickets/sync-repository-workflow.md` (this file — its own Task 1
  table above uses the OLD names deliberately, as a record of what moved; leave
  the table as-is, only fix links elsewhere in this file if any)
- `apps/align/README.md`
- `apps/epub-validate/README.md`
- `thoughts/plans/archive/player-sync-core.md`
- `thoughts/plans/archive/bookplayer-locate-hardening.md`
- `thoughts/plans/archive/bookplayer.md`
- `thoughts/plans/archive/bookplayer-align.md`
- `thoughts/plans/archive/bookplayer-align-refine-model.md`
- `thoughts/plans/archive/epoch2-epub.md`
- `thoughts/plans/archive/epoch4-alignment.md`
- Inside `docs/` itself: `docs/FORMATTING.md` (new name `docs/formatting.md`),
  `docs/FILE-LAYOUT.md` -> `docs/file-layout.md`, `docs/MARKDOWN.md` ->
  `docs/markdown.md`, `docs/README.md`, `docs/PRIVACY.md` -> `docs/privacy.md`
  all contain relative links to sibling docs (e.g. `[MARKDOWN.md](MARKDOWN.md)`)
  that need the same lowercase update — re-grep `docs/*.md` after the Task 1
  renames, don't rely on this list alone; it was taken before the renames.

Non-Markdown files (comments only — update the comment text):

- `.markdownlint-cli2.jsonc`
- `apps/align/align.ts`
- `apps/align/lib/config.ts`
- `apps/align/lib/report.ts`
- `apps/align/.gitignore`
- `apps/epub-validate/src/config.ts`
- `apps/epub-validate/.gitignore`
- `apps/bookplayer/src/lib/config.ts`

Do a find-and-replace per old->new pair from the Task 1 table (case-sensitive
match on the exact old filename, e.g. `FILE-LAYOUT.md` -> `file-layout.md`),
then re-grep to confirm zero remaining uppercase hits:

```sh
grep -rnE '\bdocs/[A-Z][A-Z0-9-]*\.md\b' . --exclude-dir=node_modules --exclude-dir=.git
```

Expect zero output except possibly this ticket's own Task 1 table (which is
intentionally historical).

## Task 3 — fix the now-stale casing statement in `docs/workflow.md`

`docs/WORKFLOW.md` (now `docs/workflow.md` after Task 1) line 6-7 currently
says:

> Filenames in `thoughts/` are lowercase kebab; only `BACKLOG.md` is
> capitalized. (`docs/` is UPPERCASE by convention; `thoughts/` is not.)

Replace with something like:

> Filenames in both `docs/` and `thoughts/` are lowercase kebab; only
> `README.md` and `BACKLOG.md` are capitalized, as recognized repository
> indexes.

(Earlier drafts of this ticket treated UPPERCASE `docs/` as a permanent,
deliberate Prosodio/nix-hardy divergence — that was wrong; Daniel overturned it
2026-07-12. If you're reading an older cached version of this ticket or of the
review that generated it, disregard the "hard constraint: do not rename"
language — it no longer applies.)

## Task 4 — deduplicate the delegation-guidance paragraph `[apply]`

`AGENTS.md`'s `## Execution` section (currently lines 13-22) and
`docs/workflow.md`'s paragraph right after the Plans section's closing bullet
(currently around line 65-70, search for "Plan coding tasks for delegation") say
the same thing — "shape coding tasks so a model/effort level can be chosen per
task" — in two different wordings. This violates the repo's own "one fact, one
home" rule and the two will drift the next time either is edited.

- Keep the fuller, more specific version in `docs/workflow.md` under `## Plans`
  (it already talks about boundaries/dependencies/risk/acceptance criteria —
  plan-writing guidance belongs there).
- Shrink `AGENTS.md`'s `## Execution` section to a single pointer line:

  ```md
  ## Execution

  Plan coding tasks for delegation (model/effort selection, boundaries,
  acceptance criteria) — see [docs/workflow.md](docs/workflow.md#plans).
  ```

## Task 5 — add the "one required gate per repo" invariant `[apply]`

nix-hardy's `docs/workflow.md` states a cross-repo invariant Prosodio's
`docs/workflow.md` doesn't currently spell out: every adopting repo names
exactly one required quality-gate command, and that command is repo-specific.
Add a short paragraph near the top of `docs/workflow.md` (after the existing
intro, before `## Backlog`) — adapt wording, don't copy nix-hardy's verbatim:

> Prosodio's one required quality gate is `bun run ci` (see `AGENTS.md`). This
> convention is shared with other repos using the same docs/thoughts model (e.g.
> nix-hardy uses `just pre-commit`) — the invariant is "name one gate," not a
> specific command.

## Task 6 — verify-only items — confirm and close, no file changes expected

For each, check the claim against the current repo state. If true, no action. If
false, fix the specific drift only.

- `thoughts/` filenames are already lowercase kebab (unaffected by this ticket —
  already true).
- `research/`, `reviews/`, `tickets/`, `plans/` are present and git-tracked even
  when empty via `.gitkeep` (already true — `git ls-files thoughts/`).
- `AGENTS.md` is canonical, `CLAUDE.md` is a thin pointer, root `README.md` is
  compact orientation with no duplicated workflow content (already true — check
  `CLAUDE.md` and `README.md` still say only "see AGENTS.md"; neither needs a
  docs/ path update since neither links to a specific renamed file).
- Ticket lifecycle: tickets are deleted on close, only `BACKLOG.md`'s
  `## Closed` section is the permanent record (already documented in
  `docs/workflow.md`'s `## Ticket` section — confirm no drift after Task 3's
  edit).
- Markdown/formatting ownership split (Prettier formats, markdownlint-cli2 with
  the `markdownlint/style/prettier` preset checks structure) already matches
  nix-hardy's newly-stated convention — compare `.markdownlint-cli2.jsonc` and
  the inline `"prettier"` block in `package.json` against nix-hardy's
  `.markdownlint-cli2.jsonc` / `.prettierrc.json`; they should already agree
  (`proseWrap: always` on both sides). Note any actual divergence found; don't
  "fix" cosmetic non-issues.

## Explicitly out of scope (do not do these here)

- Do not touch `nix-hardy` — this ticket is Prosodio-side only.
- Do not build or install the "shared workflow Agent Skill" nix-hardy's
  `shared-workflow-skill` ticket describes — that's tracked separately and is
  explicitly later work (per that ticket's own preconditions).
- Do not touch `apps/`, `packages/`, or any code beyond the comment-string
  updates in Task 2 — docs/comments-only ticket.
- Do not rename `thoughts/BACKLOG.md`, `README.md` files anywhere, or
  `CLAUDE.md`/`AGENTS.md` — only the 13 files (12 in `docs/` + the 1 `FINDINGS`
  file) in the Task 1 table move.

## Adjacent finding (separate backlog item, not part of this ticket)

The `[tier: low|med]` -> model-class delegation convention used successfully in
`thoughts/plans/archive/player-sync-core.md` ("Dispatch policy" section) is more
concrete and actionable than the abstract guidance in
`AGENTS.md`/`docs/workflow.md`. Tracked as `document-delegation-tiers` in
BACKLOG — pull the proven tier scheme from that archived plan into
`docs/workflow.md`'s Plans section as a reusable pattern, once Task 4 has
settled where that guidance lives.

## Done When

- All 13 files in the Task 1 table are renamed to lowercase kebab-case;
  `README.md` untouched.
- `grep -rnE '\bdocs/[A-Z][A-Z0-9-]*\.md\b' . --exclude-dir=node_modules --exclude-dir=.git`
  returns zero hits outside this ticket's own historical Task 1 table.
- `docs/workflow.md`'s casing statement (Task 3) is corrected.
- `AGENTS.md`'s `## Execution` section is a one-line pointer; the full
  delegation guidance lives once, in `docs/workflow.md` (Task 4).
- `docs/workflow.md` states the "one named quality gate per repo" invariant
  (Task 5).
- `bun run ci` remains the one required Prosodio quality gate, unchanged.
- `bun run lint:md` and `bun run fmt:check` pass.
- `git log --stat` on the resulting commit(s) shows clean renames (`R`), not
  delete+add pairs, for all 13 files — the signal that the macOS
  case-insensitive two-step rename worked.
