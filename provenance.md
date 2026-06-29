# Provenance

Clean-port lineage. Each component records where it came from and how
equivalence was shown. Behavior-preserving anchors are byte-identical to source;
later commits normalize (rename, paths, config).

## transcribe (port of bun-one/apps/whisper)

- source: ai-garden, `bun-one/apps/whisper`
- source commit: `7600ed8a664223db4d9d392109ee80596a21ab13` (worktree clean)
- target: `apps/whisper` (anchor) -> `apps/transcribe` (after rename)
- anchor commit: `9433707`
- transport: `rsync -avi bun-one/apps/whisper/ prosodio/apps/whisper/`
  (preserves source mtimes git drops). Gitignored `data/` (cache/models/samples,
  ~95G; `data/work` dropped) copied for local validation only — never committed.
- equivalence: 36 tracked files, blob OIDs identical to source; gitignore-gated
  so no `data/` staged. ci-RED at anchor by construction (`zod: catalog:runtime`
  unresolved, name `@bun-one/whisper`); green after the root-relation fix.
- deviations: none at the anchor.

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
