# validate-bootstrap — pointable validation core + standalone CLI

Status: active (2026-07-19) — decisions settled by interview (Daniel); branch
`validate-bootstrap`; baseline captured. Execution not yet started.

Goal: charter milestone 1
([docs/corpora/validation.md](../../docs/corpora/validation.md)) — one
validation core package taking any corpus root and emitting findings, consumed
by a standalone CLI and (unchanged) the bookplayer web server.

## Decisions (settled 2026-07-19)

- D1 core: `packages/corpus` = `@prosodio/corpus` — scan, metadata, ffprobe,
  types. PURE: defines its own root-input type (`corporaDir`, OPTIONAL
  `transcriptionsDir`); no env/named-root knowledge.
- D2 severity: `ScanFinding.severity: "failure" | "warning"`, static per code
  (unreadable-dir / multi-m4b / no-cover / duplicate-basename = failure;
  metadata-basename-fallback = warning). Pass = zero failures. `BookCache` v4 ->
  5 (findings shape changed; forces one private re-probe).
- D3 config (scoped S0): `packages/config` = named roots (fixtures, private) +
  `CORPORA_DIR`/`DATA_DIR` env resolution. Depends on corpus, NEVER the reverse.
  Bookplayer migrates as proof; transcribe/align/epub-validate stay on
  `promote-app-config` (ticket remains open for the remainder).
- D4 CLI: `apps/validate-cli` = `@prosodio/validate-cli` (dir/npm identical —
  house rule). `bun run validate <name-or-path>`: names via config; any other
  arg = bare path, read-only, no transcriptions dir (vtt reads `absent`) — how
  staging is validated. Probe by default, `--no-probe` structural pass; ALWAYS
  cache-free. Output: severity-grouped findings + PASS/FAIL verdict; exit 0 pass
  / 1 failures / 2 usage; `--json` (same typed objects the Corpora tab
  consumes).

## Steps

- [ ] S0 — packages/config (scoped) [tier: med]: named-root model + env
      resolution extracted from `apps/bookplayer/src/lib/config.ts`; bookplayer
      consumes it; other apps untouched.
- [ ] S1 — extract `packages/corpus` [tier: med]: move scan/metadata/ffprobe +
      types out of `apps/bookplayer/src/lib/` (tests move too); add severity +
      optional transcriptionsDir; bump BookCache v5; bookplayer imports from the
      package. Behavior identical (see Baseline).
- [ ] S2 — `apps/validate-cli` [tier: med]: invocation/output per D4; root
      `package.json` gains the `validate` script.
- [ ] S3 — docs + closure [tier: low]: charter milestone 1 -> done; docs/README
      index; backlog Now/Closed updates.

Mechanics: sequential, one commit per step, `bun run ci` green before each
(check `PIPESTATUS`, not the tail pipe); subagents never commit.

## Baseline (pre-refactor, 2026-07-19, commit d19d6f5)

`scanRoot` canonical-JSON sha256 (first 16 hex) — recompute with the same inline
bun script (git log of this file's commit) after S1; digests must match
byte-for-byte, proving the extraction changed nothing:

- fixtures (fixtures/audiobooks + fixtures/transcriptions): 4 books, 0 findings,
  digest `a39198d0c5333c22`.
- private (/Volumes/Space/Reading/audiobooks + data/transcribe/output): 955
  books, 0 findings, digest `70bf7c3bc4df39d5`.

CAVEAT: digests embed fingerprint mtimes — valid only while corpus files are
untouched. If Daniel modifies the corpora, recapture the baseline BEFORE S1
rather than comparing against these.

NOTE: severity (S1) adds a field to findings — both corpora have 0 findings, so
digests stay comparable; d19d6f5's scan emits no severity field.

## Acceptance (milestone 1 done)

1. `bun run validate fixtures` -> PASS (4 books, 0 failures).
2. `bun run validate private` -> runs all 955.
3. `bun run validate /Volumes/Space/Reading/audiobooks` -> runs (bare-path
   staging; result informational, not a gate).
4. `--json` on fixtures agrees with the Corpora tab's data source.
5. `bun run ci` green; Corpora tab renders identically; scan digests match
   baseline.
6. Clean checkout (after fetch-and-check-fixtures) works.

## Relates

- `merge-nx-audiobook-validation` — milestone 2 rules land in
  `@prosodio/corpus`.
- `promote-app-config` — S0 executes its core; remainder stays on the ticket.
- `align-known-mismatch-convention` — future exceptions/expectations join the
  same findings flow.
