# Provenance

Transient: delete when the consolidation port is complete.

Clean-port lineage. Each component records where it came from and how
equivalence was shown. Behavior-preserving anchors are byte-identical to source;
later commits normalize (rename, paths, config).

## epub-validate (port of epub-validate)

- source: ai-garden, `epub-validate`
- source commit: `7600ed8a664223db4d9d392109ee80596a21ab13` (worktree clean)
- target: `apps/epub-validate`
- anchor commit: `02b4fe7`
- transport: `rsync -avi epub-validate/ prosodio/apps/epub-validate/`;
  `reports/` and `node_modules/` were present locally but excluded from the
  prosodio index.
- equivalence: 49 tracked non-report files, blob OIDs 49/49 identical at the
  anchor. Daniel ran the full private corpus after the minimal dependency/path
  fixes: 1,304 occurrences / 756 distinct books; epubts-node and browser opened
  all 756 with complete structural agreement. Report changes were traced to
  repaired corpus bytes for _Circe_ and _The Murder of Roger Ackroyd_, not the
  port. Storyteller improved from 213 opened / 18 failed to 214 / 17 because
  repaired Circe now opens.
- private evidence: `apps/epub-validate/reports/` is ignored by prosodio and is
  a nested LOCAL-ONLY Git repo, never pushed. Commits `5e83966` (ai-garden
  baseline) and `f801084` (reproduced prosodio baseline) retain the comparison.
- deviations before native normalization: `zod` -> root `runtime` catalog;
  reports explicitly ignored; report replacement preserves the nested `.git`
  while deleting stale generated files; temporary `test` corpus path points to
  ai-garden fixtures.
- native normalization deviations: name -> `@prosodio/epub-validate`; app-local
  `test`/`typecheck`/`ci` scripts and `typescript@6`/`@types/bun` devDeps
  removed (root ci owns the gate); nested `bun.lock`/`knip.json` removed;
  `src/config.ts` restructured to the transcribe config-object pattern; `test`
  corpus root -> committed `fixtures/epub/`; open timeouts made env-injectable
  (`NODE_OPEN_TIMEOUT_MS` call-time read, new `BROWSER_OPEN_TIMEOUT_MS` bound,
  default 30s) — a stalled browser open now fails as category Timeout instead of
  stalling unbounded.

## transcribe (port of bun-one/apps/whisper)

- source: ai-garden, `bun-one/apps/whisper`
- source commit: `7600ed8a664223db4d9d392109ee80596a21ab13` (worktree clean)
- target: `apps/transcribe`, renamed `@bun-one/whisper` ->
  `@prosodio/transcribe`
- anchor commit: `9433707`; port commits: `02e8354` (go-native), rename (this)
- transport: `rsync -avi bun-one/apps/whisper/ prosodio/apps/whisper/`
  (preserves source mtimes git drops). Gitignored `data/` (cache/models/samples,
  ~95G; `data/work` dropped) copied for local validation only — never committed.
  Dir renamed via plain `mv` (not `git mv`) so the ignored `data/` followed
  (verified: 193 files / 95G intact).
- equivalence: 36 tracked files, blob OIDs identical to source at anchor; root
  CI green after fix (125 pass / 4 skip, the skips RUN_E2E_TESTS-gated). ci-RED
  at anchor by construction (`zod: catalog:runtime` unresolved, name
  `@bun-one/whisper`). Runtime (Daniel): cache-replayed transcriptions are
  byte-identical to bun-one — e.g. `hobbit-30m.vtt` sha1 `0f7f8a91…` matches
  source. Caveat: fresh output is never byte-identical by construction — the
  `NOTE Provenance` header embeds a wall-clock `generated` timestamp + per-run
  `elapsedMs` (and whisper.cpp is not strictly deterministic). A meaningful
  fresh-vs-fresh check compares cue content modulo that header. CI also runs a
  real `jfk` transcription on the public fixture.
- deviations: name -> `@prosodio/transcribe`; declared the phantom
  `@prosodio/vtt` dep + rewrote 8 imports; entry `whisper.ts` ->
  `transcribe.ts`, bin `transcribe`; eslint `cause` chained at `runners.ts:146`;
  README/scripts updated for the entry rename.

## vtt (port of bun-one/packages/vtt)

- source: ai-garden, `bun-one/packages/vtt`
- source commit: `7600ed8a664223db4d9d392109ee80596a21ab13` (worktree clean)
- target: `packages/vtt`, renamed `@bun-one/vtt` -> `@prosodio/vtt`
- anchor commit: `2e833e3`
- transport:
  `rsync -avi --exclude node_modules bun-one/packages/vtt/ prosodio/packages/vtt/`.
  Pure logic, no `data/`.
- equivalence: 21 tracked files, blob OIDs identical to source; 55 tests pass.
  ci-RED at anchor (name `@bun-one/vtt`; phantom dep `@standard-schema/spec`
  undeclared); green after the fix.
- deviations: name -> `@prosodio/vtt`; declared the previously-phantom
  `@standard-schema/spec` dep; 4 files prettier-normalized to prosodio config.
