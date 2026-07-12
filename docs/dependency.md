# Dependencies

## Adding

- Shared dev dep: `bun add -d <pkg>` at root.
- Member dep: `cd <member>` then `bun add <pkg>`.
- typescript stays a `peerDependency`.

## Workspace imports

Reference another member by name with the `workspace:*` protocol:

```json
{ "dependencies": { "@scope/x": "workspace:*" } }
```

`bun add @scope/x` resolves npm first, so add that line by hand, then
`bun install` from root.

## Catalogs

`catalogs.runtime` pins one version of a dep used by 2+ members in a single
place, so the duplicated sub-dependency can't drift. Add an entry only when
shared; members then reference `"catalog:runtime"`.

## Updates

- `bun run outdated` — check.
- `bun run outdated:fix` — interactive update.
- dependabot: not configured yet.
