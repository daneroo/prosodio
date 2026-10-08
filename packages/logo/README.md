# @prosodio/logo

The Prosodio logo: what it means, how it looks, and its geometry. No React and
no DOM; the React components are in `@prosodio/logo-ui`.

## Design source

The SM logo, its tiles and lockups were designed in Claude Design (2026-10-07):
[Prosodio Logo and Lockup, `Prosodio Mark.dc.html`](https://claude.ai/design/p/9f4e4cbd-ef67-4a7a-9712-f0483c2402be?file=Prosodio+Mark.dc.html).
Org-only and live: it may have moved on since; `/lab/logo` and the tests pinned
to its output are the record of what was built.

## Meaning

A pilcrow (¶) is prose. Sound waves radiate from it: the voice reading it.

## Three sizes

Each size is its own design, so there are three separate components, not one
with variants:

- Logo (SM): the pilcrow with sound waves, as paths.
- Staff logo (MD): the pilcrow as clef at the head of a staff, with letters and
  notes on the lines.
- Hero logo: the pilcrow as clef at the head of a ruled page, with a famous
  book's opening lines.

Only the SM logo has geometry here. The staff and hero logos are ports of the
prototype as they were, font glyphs and HTML rather than paths; their tuned
values live in their components (`LogoMD.tsx`, `LogoHero.tsx`):

- Staff logo: defaults are the fixed 5-line staff (the prototype's MD-0), so it
  renders the same on the server and the client. Random note positions are a
  lab-only, client-only variation.
- Hero logo: its "physical paper" colors are its own, not the page's; the dark
  paper follows a `data-theme="dark"` ancestor, the prototype's switch. The text
  is a prop; the default is the opening of _The Name of the Wind_ (the
  prototype's).

## Icons

The tile as files, in `apps/bookplayer/public/`; `ICONS` (`icons.ts`) is the one
list of names, sizes and shapes, which the head links, the manifest test and
Board 5 read:

- `favicon.ico`: 16 and 32 px frames (the favicon shape, small variant);
- `apple-touch-icon.png`: 180 px; `icon-192.png`, `icon-512.png`: the manifest's
  (`manifest.webmanifest`, written by hand). Home-screen shape: opaque square.

The manifest's `background_color` and `theme_color` (`#0f172a`, slate-900) are
the app shell's, not the logo's; its name and icons are checked against
`LOGO_NAME` and `ICONS` by Bookplayer's `test/manifest.test.ts`.

Regenerate with `bun run icons` in `packages/logo`, then commit the files; `ci`
does not regenerate them. Each is rasterised at its exact size, no downscaling.
Our own encoder (`scripts/ico.ts`) writes the ICO: PNG frames in an ICO
container, supported since Windows Vista
([layout](<https://en.wikipedia.org/wiki/ICO_(file_format)>)).

The file set follows Evil Martians,
[How to Favicon](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs),
which also recommends a separate simplified 16 px drawing rather than a
downscale: `tileLogoFor` provides it.

Rasteriser: `@resvg/resvg-js` (a devDependency of this package).

- resvg renders with tiny-skia, a Rust port of a Skia subset whose stated goal
  is to "produce exactly the same results as Skia", Chrome's rasteriser
  ([tiny-skia](https://github.com/linebender/tiny-skia)).
- No system libraries, so "the produced image will be identical" on every
  platform: deterministic, reviewable outputs
  ([resvg](https://github.com/linebender/resvg)).
- Ahead of librsvg (what sharp uses) in quality and speed by Wikimedia's 2021
  tests ([T40010](https://phabricator.wikimedia.org/T40010)); per-feature
  results against browsers:
  [resvg test suite](https://linebender.org/resvg-test-suite/svg-support-table.html).

## Code: boundaries and use

The single description of how the logo's code is split; `components/logo-ui` and
`/lab/logo` point here.

Three layers. Values live in exactly one of them.

| Layer                                      | Holds                                                       | Never                                           |
| ------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| `@prosodio/logo` (this package)            | every value and computation: geometry, sizes, colors, fonts | React, DOM                                      |
| `@prosodio/logo-ui` (`components/logo-ui`) | React components that assemble this package's values        | logo values of their own (colors, sizes, fonts) |
| apps (Bookplayer)                          | components, placed                                          | logo values; imports of `/construction`         |

This package has two entry points:

- `@prosodio/logo`, normal use: `logoFor(logo size)` and
  `tileLogoFor(tile size)` (which variant), `tileStyle`, the tile schemes and
  finishes, the lockup (`LOGO_NAME`, `lockupStyle`), and `renderLogo` /
  `renderTile` (SVG text, for icon files).
- `@prosodio/logo/construction`, the detailed API: every variable (`drawLogo`,
  `placeOnTile`, `PILCROW`, `ARC`, the defaults, the two critical sizing
  values). For the lab's boards and `logo-ui`'s `LogoTile` only.

Files, one concern each:

| File          | Concern                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `geometry.ts` | the drawing, in u: pilcrow (locked), arcs (`LogoParams`, settled defaults), box, bare frame |
| `tile.ts`     | the logo on a tile: placement (optical offset) and look (`tileStyle`: scheme × finish)      |
| `sizing.ts`   | CRITICAL: `SMALL_LOGO_MAX_PX`, `LOGO_WIDTH_ON_TILE_RATIO`; which variant at a size          |
| `colors.ts`   | the color language (sepia, cream, midnight, rust, amber), tile schemes, lockup colors       |
| `lockup.ts`   | the name and its typography beside the logo                                                 |
| `render.ts`   | the bare logo and the tile as SVG text, for icon files                                      |
| `icons.ts`    | the icon files as data: names, sizes, shapes (the files: `scripts/`, see Icons)             |

Components, normal use:

```tsx
<LogoSM size={24} />           // bare: takes the page's color (currentColor)
<LogoTile size={32} />          // the chosen tile; scheme / finish optional
<LogoLockup heading />          // the header: logo + name, all values from lockup.ts
```

`LogoTile`'s `logo` and `fit` props are the detailed API, for the lab only.

`/lab/logo` shows each layer as a board, bottom up: 0 Construction, 1 Studies, 2
Size ladder, 3 Colourway × finish, 4 Lockups & top bar, 5 Icons. A board may use
`/construction`; values it holds itself are exploration nothing uses yet (Board
4's lockups on light).

Two exceptions, by decision (#29): `LogoMD` keeps its own staff drawing (font
glyphs, `currentColor`), and `LogoHero` its paper colors as Tailwind classes
(amber-50 and amber-950, the same as cream and sepia; stone for its dark paper),
for its `data-theme="dark"` switch.
