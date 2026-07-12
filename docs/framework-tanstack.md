# TanStack Start (bun)

> Status: validated in `apps/bookplayer` (2026-07, react-start 1.168 / nitro
> 3.0.x beta / vite 8 / bun 1.3). Worked exemplar + full decision record:
> [thoughts/plans/archive/bookplayer.md](../thoughts/plans/archive/bookplayer.md).

Bootstrap + the hard-won facts. Re-check against installed versions; the CLI and
installed types override these notes.

## Scaffold

- Create:
  `bunx --bun @tanstack/cli create <name> --target-dir apps/<name> --framework React --package-manager bun --deployment nitro --toolchain eslint --no-examples --no-git --no-install`,
  then one `bun install` at the repo root (root lockfile owns resolution).
- Tailwind is always on; recent scaffolds generate `src/router.tsx` (the old
  missing-router gap is fixed).
- Prune scaffold duplication: devtools packages (no dev chrome in the product),
  the app-local prettier config/dep (root owns formatting), and the
  vitest/testing-library/jsdom stack when tests use `bun:test`.

## Nitro (bun preset)

- Use the stable-name `nitro` package, NOT the scaffold's `npm:nitro-nightly`
  alias — the alias self-references `nitro/meta` and breaks under Bun's isolated
  workspace linker (`Cannot find module 'nitro/meta'`).
- The plugin argument type admits only its own fields. Configure preset,
  `rollupConfig`, and `handlers` through the Vite `UserConfig.nitro`
  augmentation, and call `nitro()` with no args:

  ```ts
  const config = defineConfig({
    nitro: { preset: "bun", handlers: [/* see below */] },
    plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
  });
  ```

## Serving media (`<img>` / `<audio>`) — use nitro handlers

Endpoints that media elements request MUST be nitro handlers registered in
`nitro.handlers`, NOT TanStack server routes. Nitro's dev middleware
content-negotiates on `Sec-Fetch-Dest` and dispatches asset-destination requests
(`image`, `audio` — what `<img>`/`<audio>` send) only to routes in nitro's own
routing table; a TanStack server route serving the same URL 404s in dev while
`fetch()`/curl for it succeed. Production bundles both, so the break is dev-only
and easy to misdiagnose.

```ts
// vite.config.ts
nitro: {
  preset: "bun",
  handlers: [
    { route: "/api/cover/:bookId", handler: "./server/handlers/cover.ts" },
    // audio handler streams with Range/206; cover/epub/vtt buffer with an
    // exact Content-Length (avoids ERR_CONTENT_LENGTH_MISMATCH).
  ],
},
```

```ts
// server/handlers/cover.ts
import { defineHandler } from "nitro/h3";
export default defineHandler((event) =>
  serveAsset("cover", event.context.params?.bookId ?? "", event.req),
);
```

Keep the handler a thin shim over a testable `lib/media.ts` (id validation,
realpath-confined path resolution, range parsing, Response builders) so HTTP
semantics are unit-covered and the route file stays trivial.

## Server functions + routes

- `createServerFn().validator(fn)` for input validation — `inputValidator` is
  deprecated (dev-server warning).
- TanStack server routes (`createFileRoute` + `server.handlers`) are fine for
  loader data and non-media JSON; reserve nitro handlers for media as above.

## EPUB rendering (epub.js)

- Client-only dynamic import; open by URL with `openAs: "epub"`. Load lifecycle
  keyed to the asset URL only — relocation/progress must never re-open the book.
- `await book.ready` before touching the spine. Loadable `Section` objects with
  `load`/`find`/`unload` live on `spine.spineItems` — NOT `spine.items` (those
  are manifest entries; using them makes search silently return nothing).
- Clip only the outer container (`overflow: hidden`); leave epub.js internal
  scroll math alone or highlights land off-screen. Normalize range CFIs to start
  points before `rendition.display`.

## Import path aliases

- Scaffold uses `#/*` -> `./src/*` (package `imports`) with `@/*` as a
  tsconfig-paths alias. Prefer `#/…` in app code.
