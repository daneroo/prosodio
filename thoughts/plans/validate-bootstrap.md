# validate-bootstrap — pointable validation core + standalone CLI

Status: planned

Goal: charter milestone 1
([docs/corpora/validation.md](../../docs/corpora/validation.md)) — one
validation core package that takes any corpus root and emits findings, consumed
by a standalone CLI and (unchanged) the bookplayer web server.

## Grounding (read 2026-07-19, during the metadata pass)

The seam is cleaner than feared. `apps/bookplayer/src/lib/` already separates:

- **corpus truth** (extractable): `scan.ts` (pure fs walk -> BookRecord[] +
  ScanFinding[]), `metadata.ts` (pure extractor), `ffprobe.ts` (probe), the
  types (`BookRecord`, `ScanFinding`, `BookMetadata`).
- **app lifecycle** (stays): `library.ts` (cache restore/persist, carry-over,
  background enrich, singleton) — a web-app serving concern, not validation.
- **root config**: `config.ts` `RootSet` { name, corporaDir, transcriptionsDir }
  — already the pointable-root shape; `promote-app-config` generalizes it.

The browser never runs any of this; it receives serialized rows. Nothing in the
extractable set imports app code (only `config.ts` types).

## Decisions (open — Daniel)

- D1 package name/shape: `packages/corpus` holding scan + probe + metadata +
  finding types (recommend; "validation core" grows here, the name stays honest
  as discovery/metadata also live in it).
- D2 severity: the charter says pass/fail + warnings, but `ScanFinding` has no
  severity axis. Recommend: add `severity: "failure" | "warning"` at the core
  (existing codes: multi-m4b/no-cover/duplicate-basename/unreadable-dir =
  failure — they exclude books; metadata-basename-fallback = warning). CLI exit
  code = failures > 0.
- D3 probing in the CLI: findings like metadata-basename-fallback need ffprobe
  (~4/s concurrency; 955 books ≈ minutes, fixtures ≈ seconds). Recommend: probe
  by default, `--no-probe` for a fast fs-only pass; the CLI stays cache-free
  (caches are the app's concern).

## Steps

- [ ] S0 — promote-app-config [tier: med]: `packages/config` per its ticket
      (four consumers; `CORPORA_DIR`/`DATA_DIR` overrides). The root-set model
      moves here; bookplayer/align/transcribe/epub-validate consume it.
- [ ] S1 — extract the core [tier: med]: move scan/metadata/ffprobe + types into
      `packages/corpus`; bookplayer's `library.ts` imports from it; tests move
      with their modules. No behavior change (blob-level where possible).
- [ ] S2 — the CLI [tier: med]: `apps/validate` (bun): `validate <root>` (named
      root or path), runs scan (+probe per D3), prints findings + summary, exit
      code per D2. Severity lands in the core here.
- [ ] S3 — docs + closure [tier: low]: charter milestone 1 -> done; README
      pointers; Corpora tab unchanged (proof the seam held).

Acceptance: `bun run validate fixtures` and `... validate <private path>` both
work from a clean checkout; `bun run ci` green; the Corpora tab renders
identically before/after (same findings, same rows).

## Relates

- `merge-nx-audiobook-validation` — milestone 2 rules land in this package.
- `promote-app-config` — S0 is that ticket, executed here.
- The nx-audiobook `apps/validate -r <root>` CLI is the proven reference shape.
