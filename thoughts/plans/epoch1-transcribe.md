# epoch1-transcribe — Transcribe (first port)

Goal: a working reproduction of whisper as `apps/transcribe` — NOT an extracted
vtt package and NOT an end-to-end player.

`bun-one/apps/whisper` is the consolidated, mature implementation; nothing is
needed from the dead `whisper-sh` / `whisper-bench`.

- [ ] Clean-port `bun-one/apps/whisper`, keeping its trusted VTT
      (`lib/vtt-writer.ts`) internal. Two-phase, behavior-preserving first; the
      equivalence/acceptance contract is settled during execution, not
      pre-specified (deferred per Codex).
  - [x] Anchor: `rsync -a bun-one/apps/whisper/ apps/whisper/` (verbatim name;
        `-a` preserves the source files' mtimes, which git drops). Brings the
        gitignored `data/` (warm cache, models, samples) for local validation
        only — it stays gitignored, never committed or published. `data/work`
        (transient scratch, ~266G) is dropped upstream, not ported.
  - [x] Gitignore gate, then commit as-is (`9433707`): only the 36 tracked files
        stage, zero `data/`. Byte-identical (blob OIDs match ai-garden@7600ed8),
        ci-RED by construction (`zod: catalog:runtime` unresolved until the root
        catalog gains zod). Lineage in `provenance.md`.
  - [ ] Fix in place (no rename yet): add `zod` to the root `runtime` catalog,
        fix `package.json` (name, deps), update refs; `bun install`; CI green
        locally then from the root. Prettier-normalizing the ported files gives
        up byte-identity here (noted in `provenance.md`).
  - [ ] Validate it runs as-is against the populated cache (Daniel).
  - [ ] Rename `apps/whisper` -> `apps/transcribe` (`git mv`, entry, refs);
        re-green CI.
- [ ] Point it at the central corpora location and `reports/` output; adjust
      paths only.
- [ ] Prove the root CI target includes the app.
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
