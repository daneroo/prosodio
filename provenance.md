# Provenance

Clean-port lineage. Each component records where it came from and how
equivalence was shown. Behavior-preserving anchors are byte-identical to source;
later commits normalize (rename, paths, config).

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
  `@bun-one/whisper`).
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
