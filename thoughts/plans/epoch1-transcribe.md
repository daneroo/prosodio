# epoch1-transcribe — Transcribe (first port)

Goal: a working reproduction of whisper as `apps/transcribe` — NOT an extracted
vtt package and NOT an end-to-end player.

`bun-one/apps/whisper` is the consolidated, mature implementation; nothing is
needed from the dead `whisper-sh` / `whisper-bench`.

- [ ] Clean-port `bun-one/apps/whisper`, keeping its trusted VTT implementation
      internal. The rename (-> `apps/transcribe`?) and the
      equivalence/acceptance contract are settled during execution, not
      pre-specified (deferred per Codex).
- [ ] Point it at the central corpora location and `reports/` output; adjust
      paths only.
- [ ] Prove the root CI target includes the app.
- [ ] Use the port to validate runtime-bound package/app conventions.
- [ ] Acceptance: judged by Daniel at port time (see port strategy in the
      consolidation plan).
