# sync-repository-workflow — lowercase `docs/`, dedupe delegation guidance

Status: active

Goal: rename all `docs/` filenames to lowercase kebab-case (reversing the
earlier UPPERCASE decision), fix every reference, and land the two small
nix-hardy-derived workflow improvements the ticket identified.

Ticket: [sync-repository-workflow](../tickets/sync-repository-workflow.md) (full
inventory, verified rename mechanics, and rationale — read it before starting;
this plan is the execution checklist).

## Dispatch policy

This is docs-only, fully-specified mechanical work (renames + find/replace + two
short prose edits) — not application code. The orchestrator executes it directly
rather than dispatching: the rename mechanics were empirically verified
(scratch-repo testing) specifically because the wrong approach (raw `mv` +
`git add`) fails silently, and re-explaining that to a fresh subagent adds
translation risk on exactly the thing already flagged as dangerous. No design
judgment is needed per task — dispatch would add overhead, not safety, here.
(Contrast with `player-sync-core`, where each task needed real
design/implementation judgment and subagent dispatch was the right call.)

No branch: low-risk, docs-only, single session — direct commits to `main`, one
per task, `bun run ci` green before each.

## Tasks

- [ ] T1 — rename all 13 files (Task 1 in the ticket: 12 under `docs/` + the
      `FINDINGS` file under `apps/epub-validate/docs/`) to lowercase kebab-case
      via the verified two-hop `git mv` procedure. Verify with
      `git status --short` after each pair.
- [ ] T2 — update every link/comment referencing the old names (Task 2's 20-file
      inventory), then re-grep to confirm zero stale uppercase `docs/`
      references remain (excluding the ticket's own historical table).
- [ ] T3 — fix `docs/workflow.md`'s casing statement (was: "docs/ is UPPERCASE
      by convention"); state both `docs/` and `thoughts/` are lowercase kebab,
      `README.md`/`BACKLOG.md` excepted.
- [ ] T4 — dedupe delegation guidance: shrink `AGENTS.md`'s `## Execution`
      section to a pointer, keep the full version in `docs/workflow.md` under
      `## Plans`.
- [ ] T5 — add the "one named quality gate per repo" invariant to
      `docs/workflow.md`.
- [ ] T6 — verify-only checks (already-true items per the ticket); fix only if
      something's actually wrong.
- [ ] P7 — `bun run ci` green, `bun run lint:md` clean, final
      `grep -rnE '\bdocs/[A-Z][A-Z0-9-]*\.md\b' . --exclude-dir=node_modules --exclude-dir=.git`
      returns nothing outside the ticket's historical table.

## Closing

Move `sync-repository-workflow` to BACKLOG's Closed section, delete the ticket,
move this plan to `plans/archive/`.
