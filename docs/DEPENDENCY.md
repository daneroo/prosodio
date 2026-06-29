<!-- ported from ai-garden@9b076ed88:bun-one/docs/WORKSPACE-BUN.md -->

# Dependencies

- Shared dev dep: `bun add -d <pkg>` at root.
- Member dep: `bun add <pkg> --filter @scope/name` (or `cd` the member).
- typescript is a `peerDependency`, not pinned.
- Workspace import: `"@scope/x": "workspace:*"`. `bun add @scope/x` resolves npm
  first — hand-add `workspace:*`, then `bun install` from root.
- Catalogs: put a version in `catalogs.runtime` only when 2+ members share it;
  members reference `"catalog:runtime"`.
- Outdated: `bun outdated -r`. Update: `bun update -i -r` (interactive).
- dependabot: not configured yet.
