# TanStack Start (bun)

> Status: not validated in prosodio — ported notes, not yet run here.

Bootstrap specifics only.

- Create:
  `bunx --bun @tanstack/cli create <dir> --package-manager bun --framework React --add-ons nitro --no-git`
- Nitro Vite plugin with bun preset: `nitro({ preset: "bun" })`.
- Scripts use bun-driven Vite: `bun --bun vite dev|build|preview`.
- Alias `@/*` -> `./src/*` in `tsconfig.json` + Vite.
- If scaffold misses `src/router.tsx`, add it (export `getRouter()` from
  `createRouter({ routeTree })`).
