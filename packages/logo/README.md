# @prosodio/logo

The Prosodio logo: what it means, how it looks, and its geometry. No React and
no DOM; the React components are in `@prosodio/logo-ui`.

## Prototype

The idea was prototyped in ai-garden, `bun-one/apps/vite-one/src/pages/Logo.tsx`
(commits from 2026-01-18 through `fa86449be` on 2026-01-19). They hold the SM
`¶)` variant and the hero. Drawn with font glyphs and theme colors there; here
it is paths. This pointer is removed at the end of spec #25.

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

- Staff logo: defaults are the prototype's MD-0, so it renders the same on the
  server and the client. Random note positions are a lab-only, client-only
  variation.
- Hero logo: its "physical paper" colors are its own, not the page's; the dark
  paper follows a `data-theme="dark"` ancestor, the prototype's switch. The text
  is a prop; the default is the opening of _The Name of the Wind_ (the
  prototype's).

## Visual rules (provisional)

- In the app the logo is one color, `currentColor`, on a transparent background:
  it takes the colors of the page it sits on.
- Two drawings on one square viewBox: small (16 px and below: simplified,
  heavier strokes, fewer arcs) and regular.
- A tile is the logo on an opaque square background, for places with no page to
  take colors from: slate-900 `#0f172a` background, cyan-400 `#22d3ee` logo.
  Gradient and border exist as parameters and are off.
- Favicon tile: rounded corners, transparent only at the corners. Home Screen
  tile: opaque full-bleed square, no rounded corners (iPadOS applies its own
  mask and renders transparent pixels as black).
- No raster of the bare logo: a fixed color would vanish on one of the two
  themes.

## Where things live

- This package: geometry (two drawings), the size to drawing selector,
  provisional tile parameters, and a pure renderer returning SVG strings (bare
  logo or tile).
- `@prosodio/logo-ui` (`components/logo-ui`): the React components (`LogoSM`,
  `LogoMD`, `LogoHero`) and the hero's openings.
