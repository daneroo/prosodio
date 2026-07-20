# merge-nx-audiobook-validation — charter milestone 2: vetted rule parity

Status: done (2026-07-20) — S1-S5 executed; all three corpora validate PASS
(private 955/955 probed, 0/0). Books-array digests held throughout.

Goal: port the `nx-audiobook` validation rules — VETTED, not copied — into
`@prosodio/corpus` + `apps/validate-cli`, so `nx-audiobook`'s validator can
retire. Reference: the Codex overview
([thoughts/research/nx-audiobook-apps-validate-overview-by-codex.md](../research/nx-audiobook-apps-validate-overview-by-codex.md)).

Fresh fact: Daniel ran the nx validation TODAY (2026-07-19), after the Fixture
Rabbits landed in private — the nx `modTimeDB` (896 entries,
`~/Code/iMetrical/nx-audiobook/apps/validate/src/app/hints/modTime.ts`) is
current, so first-run drift should be ~zero. He runs it every time something
lands in private.

## The vet (settled)

- KEEP strays ("unaccounted files"), tightened: case-INSENSITIVE matching;
  allowlist `.m4b`, `.epub`, `.pdf`, `cover.jpg`, `cover.png`, `metadata.json`,
  plus the hints file name; ignore `.DS_Store` (it has its own finding),
  `MD5SUM`. NO `.mp3`/`.m4a` (m4b-only post-conversion — a mid-conversion
  staging dir truthfully warns).
- DROP author/title (superseded by tags-canonical + basename-fallback); ADD
  `metadata-missing-author` warning (title tag present, artist absent — 0 on
  curated corpus today).
- KEEP duration: probe succeeded but durationSec <= 0 -> finding. Probe FAILURE
  stays "unprobed", never a finding.
- DROP cover checks (our `no-cover` failure is stricter; embedded art
  irrelevant).
- KEEP hygiene trio as report-only findings: `.DS_Store` present; perms not 644
  (files) / 755 (dirs); xattrs present EXCEPT a sole `com.apple.provenance`
  (unremovable on modern macOS — tolerated, per the nx Justfile special case).
- KEEP mtime hints (design below).
- DEFER naming conventions (never nx behavior; belongs with
  `align-known-mismatch-convention`'s keyword-cue design).

## Mtime hints design (settled)

- DB: `data/validate/mtime/<rootName>.mtime-hints.json`, gitignored; the
  `data/validate/mtime/` dir may later become a nested local git repo (the
  epub-validate reports/ precedent) — that is the long-term persistence story,
  recorded here. PLAIN JSON, not jsonc (Daniel, 2026-07-20: comments cannot
  survive programmatic rewrites, so don't pretend to support them).
- Shape (Daniel's final): flat
  `{ "<m4b basename>": "2026-07-19T19:22:59Z", ... }` — basename-keyed (one
  identity scheme; retags don't orphan), value = ISO 8601 seconds Z. No note
  field.
- Compare at SECOND granularity; scope = the m4b file AND the book dir (nx
  parity; epub/cover were nx TODOs, not behavior).
- Absent hint = FAILURE (nx parity). Mismatch = FAILURE. Orphaned hint (entry
  with no book) = always-on WARNING (nx's own unfinished TODO).
- `--record-mtimes`: append-only capture for books lacking entries; ATOMIC write
  (temp + rename); prints each appended entry; never overwrites (corrections are
  hand-edits). Writes only the DB — the corpus is never touched (charter fence
  intact). Per-entry confirmation: future fix/apply refinement, not now.
- Named roots only; bare paths skip the mtime rules.
- BOOTSTRAP: a named root with NO hints file at all skips the mtime rules with a
  single "no hints DB" warning (absent-hint = failure presumes a DB exists).
  Creating the DB is one `--record-mtimes` run.

## Severity (settled)

failure: mtime-absent, mtime-mismatch, bad-duration (+ existing four exclusion
codes). warning: stray-file, ds-store, bad-perms, xattrs, orphan-hint,
missing-author (+ existing basename-fallback).

## Execution split (settled)

- `scanRoot` gains ONLY strays (same walk, zero extra I/O) — Corpora tab
  benefits; web boot stays fast. No BookCache bump (finding SHAPE unchanged;
  codes widen).
- Deep rules (hygiene, mtime, duration, missing-author) are pure functions in
  `@prosodio/corpus`, executed by the CLI only; hints DB is INJECTED (the
  package stays repo-ignorant).

## Steps

- [x] S1 — strays in scanRoot [tier: med]: allowlist per vet (case-insensitive),
      `stray-file` finding code + severity; walk collects unrecognized files it
      currently ignores; tests incl. case variants. Books-array digests MUST
      match baseline (below).
- [x] S2 — deep rules in packages/corpus [tier: med]: `hygiene.ts` (walk:
      ds-store / perms / xattr via `xattr -l` subprocess or node lstat mode
      bits; provenance tolerance), `mtime.ts` (pure: books + injected hints ->
      findings incl. orphan warnings), duration + missing-author checks as
      post-probe helpers. All pure/injected, unit-tested with temp dirs.
- [x] S3 — CLI integration [tier: med]: hints loading for named roots (JSONC),
      deep-rule execution order, `--record-mtimes` (atomic append), findings
      merged into the severity-grouped output; extend --json. Tests: stub
      corpora in temp dirs, record-then-validate round-trip, orphan + absent +
      mismatch cases.
- [x] S4 — first real private run [orchestrator]: the conversion is DONE —
      Daniel converted the nx DB himself (2026-07-20): 973 keys -> 955
      basename-keyed entries (18 unused keys pruned — exactly what the
      orphan-hint rule exists to catch; 0 missing books), now at
      `data/validate/mtime/private.mtime-hints.json`. Remaining:
      `bun run validate private` — expect PASS (nx validated today); review any
      findings with Daniel. Record fixtures' hints via `--record-mtimes`.
- [x] S5 — docs + closure [tier: low, orchestrator]: charter milestone 2 -> done
      (retirement of the nx validator is Daniel's call after a real staging
      cycle — noted, not gated); backlog updates; gitignore for data/validate/.

Mechanics: sequential, one commit per step, `bun run ci` green before each
(check PIPESTATUS); subagents never commit.

## Baseline (2026-07-19, branch point d4247d2)

Books-array digests (findings are ADDITIVE this milestone, so full-output
identity no longer applies; the book RECORDS must not change):

- fixtures: 4 books, books-digest `80b186467facb162`
- private: 955 books, books-digest `7b2d8bc7286cd3b5`

Same mtime caveat as the bootstrap baseline: recapture if corpus files are
touched first.

## Acceptance

1. `bun run validate fixtures` -> PASS. Before any hints DB exists the mtime
   rules skip with the "no hints DB" warning; after one `--record-mtimes` run
   the full pipeline exercises and stays PASS (the fixtures hints file is
   gitignored and regenerates on a fresh checkout).
2. Books-array digests match baseline on both corpora.
3. `bun run validate private` after S4 conversion: reviewed with Daniel; target
   PASS once new books are recorded.
4. Hygiene + mtime rules demonstrably fire in unit tests (synthetic temp
   corpora) — and the strays rule appears on the Corpora tab.
5. Staging bare-path run works (hygiene fires there; mtime skipped).
6. `bun run ci` green throughout.

## Relates

- `align-known-mismatch-convention` — the exceptions/expectations mechanism will
  later acknowledge findings this milestone emits.
- `promote-app-config` — untouched by this milestone.
- nx-audiobook retirement — Daniel's action in that repo, post-trust.
