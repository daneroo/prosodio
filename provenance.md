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
