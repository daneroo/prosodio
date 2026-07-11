# bookplayer-ebook-renderer — keep the EPUB renderer swappable

why: epub.js (0.3.x) is old and weakly typed — search/highlight was the codex
experiment's death, and it logs caught IndexSizeErrors during some relocations.
Accepted for v1; the whole API surface is isolated in one component
(`apps/bookplayer/src/components/EpubReader.tsx`) behind a lifted controller so
a swap does not touch the player.

- candidates: readium-js / `@readium`, foliate-js, or a custom paginator over
  the already-extracted spine text (`packages/align` `epub-extract.ts`). Trade
  rendering fidelity vs control over search/highlight/CFI.
- operational lessons to carry (from the locator work): `display()` and
  `annotations.highlight()` are distinct; Promise completion is not visual paint
  completion; repeated display should be latest-wins without repagination when
  the target is visible; keep EPUB script execution sandboxed (`about:srcdoc`
  blocked-script warning is expected).

revisit-when: search/highlight reliability or reader theming becomes a real
limitation. See [plans/archive/bookplayer.md](../plans/archive/bookplayer.md)
§EPUB reader.
