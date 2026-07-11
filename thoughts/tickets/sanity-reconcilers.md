# sanity-reconcilers — desired -> actual convergence validators

state: principle; post-seed; pairs with the `@bun-one/quality` direction.

- k8s-style: state DESIRED generally, compute ACTUAL from the source of truth,
  report/converge the diff. Mechanism is open (jq, bun script, CUE — not the
  point); the loop is. Enforces invariants the type system/formatters can't.
- naming: `sanity:<thing>` (e.g. `sanity:editor`, `sanity:catalog`), umbrella
  `sanity` runs all, gateable in `ci`. Placeholder `sanity` script exists now.
- known instances (extensible):
  - editor settings: desired = settings we care about (formatter routing,
    format-on-save, rulers…); actual = layered `.vscode`/user JSON. PROVEN
    kernel: `jsonc-parser` via bun -> jq. Demonstrated on Cursor.
  - package.json invariants: catalog hoisting (dep in 2+ packages MUST be a
    `catalog:` entry), allowed fields, version-pin policy, script presence.
