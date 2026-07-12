# sync-repository-workflow — Back-Port Shared Workflow Refinements

Review the docs/thoughts workflow refinements developed in nix-hardy and
back-port the settled shared conventions to Prosodio without overwriting its
application-specific commands, taxonomy, or safety constraints.

## Candidate Changes

- Use lowercase kebab-case for ordinary `docs/` and `thoughts/` filenames;
  reserve uppercase for notable indexes or control files such as `README.md` and
  `BACKLOG.md`.
- Keep `AGENTS.md` canonical, `CLAUDE.md` as a thin pointer, and the root README
  as a compact orientation rather than a duplicate workflow reference.
- State the shared workflow invariant that every adopting repository names one
  required quality gate while keeping the command local (`bun run ci` here,
  `just pre-commit` in nix-hardy).
- Preserve the lifecycle from volatile thoughts into durable docs: delete
  designs, tickets, and plans after their useful content is harvested; retain
  only the backlog as the persistent thoughts index.
- Ensure optional thoughts buckets remain present without encouraging empty
  speculative documents.
- Compare Markdown conventions and formatting/lint ownership without coupling
  the shared workflow to a package manager or command runner.

## Coordination

- Treat case-only renames carefully on case-insensitive macOS filesystems. Use
  an explicit two-step `git mv` through a temporary filename, verify the staged
  rename, and update all links with the final casing.
- Treat nix-hardy and Prosodio as two adaptations of a common convention, not
  generated copies of one another.
- Record deliberate differences instead of forcing textual identity.
- Feed any improved shared wording back to nix-hardy.
- Coordinate with nix-hardy's `shared-repo-workflow` and `shared-workflow-skill`
  tickets; skill packaging remains later work after the convention is tested in
  both repositories.

## Done When

- Prosodio's durable docs and transient thoughts follow the agreed lifecycle.
- Ordinary documentation filenames use the settled lowercase convention, with
  all links and references updated.
- `bun run ci` remains the one required Prosodio quality gate.
- Shared conventions and Prosodio-specific adaptations are distinguishable.
