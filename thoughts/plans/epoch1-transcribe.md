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
  - [ ] Validate it runs as-is against the populated cache (Daniel).
- [ ] Point it at the central corpora location and `reports/` output; adjust
      paths only.
- [x] Prove the root CI target includes the app (root `bun test` runs the app +
      vtt suites; 125 pass / 4 skip).
- [ ] Use the port to validate runtime-bound package/app conventions.
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
