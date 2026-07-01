# epoch1-transcribe — Transcribe (first port)

Goal: a working reproduction of whisper as `apps/transcribe` plus its real
dependency `@prosodio/vtt` (the trusted VTT engine, ported from
`bun-one/packages/vtt`). NOT an end-to-end player.

`bun-one/apps/whisper` is the consolidated, mature implementation; nothing is
needed from the dead `whisper-sh` / `whisper-bench`.

Discovery (corrects the old premise): the app's trusted VTT is NOT internal — it
depends on the real, tested `@bun-one/vtt` package (parser/stitcher/schema/time)
as an undeclared workspace (phantom) dependency; `lib/vtt-writer.ts` is only a
serializer over it. So the port carries two components — vtt first.

Decisions (settled at execution): `@prosodio/*` scope across packages and apps;
vtt schemas ported dual (zod + valibot), the standardize-on-one call left to
Axis 2; `lib/vtt-writer.ts` stays app-side for now.

- [x] Port `bun-one/packages/vtt` -> `packages/vtt` as `@prosodio/vtt` — the
      trusted VTT engine. Two-phase, behavior-preserving first.
  - [x] Anchor (`2e833e3`): rsynced `bun-one/packages/vtt/` -> `packages/vtt/`
        (node_modules excluded); gate clean (21 files, blob OIDs 21/21);
        committed as-is = ci-RED anchor. `provenance.md` entry.
  - [x] Fix: renamed to `@prosodio/vtt`; declared `@standard-schema/spec`;
        cataloged `valibot` in root `runtime`. Self-clean: 55 tests pass,
        eslint/types clean, prettier-normalized 4 files (byte-identity given
        up). Contributes to root CI green once the app lands.
- [ ] Port `bun-one/apps/whisper` -> `apps/transcribe` as
      `@prosodio/transcribe`. Two-phase; the verbatim anchor already landed.
  - [x] Anchor: `rsync -a bun-one/apps/whisper/ apps/whisper/` (verbatim name;
        `-a` preserves source mtimes git drops). Gitignored `data/` (warm cache,
        models, samples) copied for local validation only — never committed.
        `data/work` (~266G) dropped upstream.
  - [x] Gitignore gate + commit as-is (`9433707`): 36 files stage, zero `data/`;
        byte-identical to ai-garden@7600ed8; ci-RED by construction.
  - [x] Go native: declared `@prosodio/vtt` (`workspace:*`), rewrote the 8
        `@bun-one/vtt` imports -> `@prosodio/vtt`, fixed the eslint
        `preserve-caught-error` finding (`runners.ts:146`, chained `cause`),
        `zod` -> root catalog. Root CI GREEN (125 pass / 4 skip). Name interim
        `@prosodio/whisper`; dir rename next.
  - [x] Renamed `apps/whisper` -> `apps/transcribe` via plain `mv` (ignored
        `data/` followed: 193 files / 95G intact), entry `transcribe.ts`, name
        `@prosodio/transcribe`, bin `transcribe`, README/scripts refs updated.
        CLI smoke (`transcribe.ts -h`) ok; root CI green.
  - [x] Validate it runs as-is against the populated cache (Daniel): ran many
        cache-replayed transcriptions; output byte-identical to bun-one (e.g.
        `hobbit-30m.vtt` sha1 `0f7f8a91…`). Caveat: fresh output is never
        byte-identical by construction (the `NOTE Provenance` header embeds a
        wall-clock `generated` + per-run `elapsedMs`; whisper.cpp also
        non-deterministic) — so this is cache-replay equivalence, at/above the
        plan's semantic-equivalence bar.
- [ ] Point it at the central corpora location and `reports/` output. Scope grew
      (Daniel) to FILE-LAYOUT conformance — done now, pre-merge:
  - [x] Single `lib/config.ts`: a `config` object, one `DATA_DIR` root deriving
        `{cache,work,output,models,sampleDir}`; repointed `transcribe.ts`,
        `lib/cache.ts`, `lib/runners.ts` AND all six test files (the move
        surfaced hardcoded test paths). Daniel-tested.
  - [x] Repoint `DATA_DIR` -> top-level `data/transcribe`; `mv`d the real
        content (warm cache + 17G samples intact); `apps/transcribe` is now
        data-free. Daniel-tested (cached + do-series runs good).
  - [ ] Later: promote `lib/config.ts` -> `packages/config`; env overrides
        (`DATA_DIR`, `CORPORA_DIR`).
  - [~] Scripts: `demo.sh`, `do-series.sh`, `show-performance.sh` repointed
    (self-location-derived, help interpolated). Remaining: `run-bench.ts`
    repoint; triage/drop `tools/{vtt-compare,vtt-monotonicity}`.
  - [~] Reproducible fixtures (replaces the private `hobbit` samples;
    cross-epoch — feeds epub/alignment too). Structure mirrors corpora:
    `fixtures/audiobooks/<Author - Title>/` holds the `.epub` + `.m4b`; small
    audio smoke fixtures in `fixtures/audio/`.
    - [x] `fixtures/manifest.jsonc`: bare array of `{url, path, sha256}` —
          fetch + verify only, no ops in the manifest. jsonc (JSON + `//`
          notes), loaded via `Bun.JSON5.parse` (jsonc ⊊ json5; `.json()` is
          strict). Entries: jfk.mp3 (whisper.cpp), Alice `.m4b` (archive.org),
          Alice `.epub` (Gutenberg #11); digests pinned from Daniel's downloads.
    - [x] `scripts/fetch-and-check-fixtures.ts`: top-down reconciler (desired =
          manifest + 2 derived, actual = disk). Fetch-if-missing via `curl`
          (fetch+Bun.write stalls on large streams) -> verify sha256 ->
          quarantine mismatch; then 2 ffmpeg derivations: `jfk.m4b` <-
          `jfk.mp3`; `alice-30m.m4b` <- full Alice (`-t 1800 -c copy`,
          duration-checked). Output split fetch/derive sections.
    - [x] `.gitignore` (decided — final): ignore only the large fetched
          audiobook `.m4b` (`audiobooks/**/*.m4b`, ~98MB); commit the rest —
          `manifest.jsonc`, `jfk.mp3`, the `.epub`, and the small produced audio
          m4b (`jfk.m4b` 94K, `alice-30m.m4b` 14M; revisit for CI). Gutenberg
          outage-proofed the epub by committing it. Same pass (Daniel) pruned
          the dangerous broad boilerplate ignores (`out`/`dist`, `coverage`,
          `logs`/`*.log`, caches, `.idea`) — they hide files under `git add .`;
          kept only specific, visible ignores.
    - [x] Demo uses `alice-30m.m4b` (committed fixture; input from `fixtures/`,
          output to volatile `data/`). Duration soft-validated in the fetch
          script (~1800s, no digest). Chose to make `-i` `demandOption`
          (required) over defaulting to alice — nothing relied on the default
          (scripts/tests pass input explicitly); dropped `DEFAULT_INPUT`, the
          private `hobbit-30m` path, and the now-unused `join` import. README
          hobbit examples remain (doc cleanup, separate).
    - [ ] Migration: relocate committed jfk `test/fixtures/` ->
          `fixtures/audio/`, repoint tests, handle `roadnottaken.m4b`.
  - [ ] Later: augment `FILE-LAYOUT.md` with `data/<app>/<category>` once
        satisfied; revisit `samples` -> fixtures/corpora.
- [x] Prove the root CI target includes the app (root `bun test` runs the app +
      vtt suites; 125 pass / 4 skip).
- [x] Use the port to validate runtime-bound package/app conventions: pure
      `@prosodio/vtt` (`packages/*`, no runtime binding) feeds the runtime-bound
      `@prosodio/transcribe` (`apps/*`, shells out to ffmpeg/whisper-cli) —
      `workspace:*` + catalog resolve from root, CI green.
- [ ] Acceptance: judged by Daniel at port time (see port strategy in the
      consolidation plan).

## Progress log

Append-only; newest at the bottom. Each entry: date, step, command/commit.

- 2026-06-29 — Plan staged for Phase A: verbatim ci-RED anchor, gitignore gate,
  two-phase port mechanics (rsync preserves source mtimes git drops).
- 2026-06-29 — Anchor landed (`9433707`). Daniel dropped `data/work` upstream,
  then `rsync -avi bun-one/apps/whisper/ prosodio/apps/whisper/` (102G, dry-run
  re-pass idempotent). Gate: 36 files stage, zero `data/`; blob OIDs match
  source 36/36. Lineage in `provenance.md`.
- 2026-06-29 — Scope grew: `tsc` exposed `@bun-one/vtt` (and transitive
  `@standard-schema/spec`) as undeclared phantom workspace deps — the app's real
  VTT engine is `bun-one/packages/vtt`, not internal. Plan restructured to port
  vtt first as `@prosodio/vtt`, adopt `@prosodio/*` scope, fold the
  whisper->transcribe rename into the green push (anchor already preserves
  provenance, so no value postponing).
- 2026-06-29 — vtt anchor landed (`2e833e3`): Daniel rsynced
  `bun-one/packages/vtt` (node_modules excluded, dry-run idempotent); gate clean
  (21 files, blob OIDs 21/21). Fix (uncommitted, pending approval): renamed
  `@prosodio/vtt`, declared `@standard-schema/spec`, cataloged `valibot`; 55
  tests pass, eslint/types clean, 4 files prettier-normalized. Root CI still RED
  only on the app's 8 `@bun-one/vtt` imports (app go-native next).
- 2026-06-29 — vtt fix committed (`1ee13a1`). App go-native (`02e8354`):
  declared `@prosodio/vtt`, rewrote 8 imports, chained eslint `cause` — root CI
  GREEN. Then renamed `apps/whisper` -> `apps/transcribe` (plain `mv`; ignored
  `data/` followed, 193 files / 95G verified intact), entry/name/bin ->
  transcribe, README/scripts updated. CLI smoke ok; root CI green (125 pass / 4
  skip). Remaining: Daniel's warm-cache validation, then corpora/reports paths.
- 2026-06-29 — Validation PASSED (Daniel): ran many cached transcriptions,
  output byte-identical to bun-one (`hobbit-30m.vtt` sha1 `0f7f8a91…` matches);
  fresh uncached book running. Stronger than the planned semantic-equivalence
  bar. Both ports done + green; only Phase-B corpora/`reports/` path
  normalization left in Epoch 1 (plus Daniel's final acceptance).
- 2026-07-01 — Reproducible fixtures landed (staged, pending commit): manifest
  `.jsonc` (JSON5-parsed) + `scripts/fetch-and-check-fixtures.ts` reconciler
  (curl fetch -> sha256 verify -> quarantine -> 2 ffmpeg derivations, split
  output). `.gitignore`: commit seeds + small produced audio, ignore only the
  98MB fetched audiobook m4b; Daniel also pruned the dangerous broad boilerplate
  ignores. Committed the epub (Gutenberg was down mid-session — outage-proof).
  CI green (125/4). Next: `alice-30m` as demo `DEFAULT_INPUT`; jfk
  `test/fixtures/` -> `fixtures/audio/` migration.
