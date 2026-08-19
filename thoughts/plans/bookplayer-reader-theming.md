# bookplayer-reader-theming — reader theming + iPad word gesture

Status: active

Goal: control the EPUB reading surface (book default / light / dark + a chosen
reading font) from the reader toolbar, and make the reverse-sync word gesture
work on iPad.

Design:
[design/bookplayer-reader-theming-design.md](../design/bookplayer-reader-theming-design.md)
— read §4 (app-side wrapper background), §6 (decisions), §7 (palettes and font
stacks) and §8 (in-reader comparison) before starting T1.

Covers two backlog items, both scheduled in `## Now`:
`bookplayer-reader-theming` (T1, T2, T4) and `bookplayer-word-gesture-ipad`
(T3). They share one file and one device-verification pass, which is why they
ship together.

Mechanics per `docs/workflow.md`: sequential delegation, one commit per task,
`bun run ci` green before each commit, subagents never commit.

## T1 — theme model + controller wiring + dev-only font comparison [tier: med]

All in `apps/bookplayer/src/components/EpubReader.tsx`. Full spec in design §10
task 1. In short: replace the hardcoded `themes.default` (line 372-375) with
`register`/`select` over three states; `useState` + lazy localStorage
initializer driving BOTH the wrapper `className` and the epub.js select; add
`setTheme` to `ReaderController` and `onThemeChange` to the props; redisplay
through the existing `displayScheduler` so position survives a theme change.
Same task adds the `import.meta.env.DEV`-gated tap control cycling
`rendition.themes.font()` over the four candidate stacks.

- [ ] implement
- [ ] acceptance: theme switch mid-read keeps position; no flash on a dark first
      paint; book-default shows genuinely unstyled book CSS; `bun run ci`

## T2 — production toolbar control + route plumbing [tier: low]

`ReaderToolbar.tsx` gains the 3-way cycle button beside Chapters/pager/search;
`routes/player/$bookId.tsx` holds the theme state and passes it down, same shape
as `toc`/`controller`. Design §10 task 2. Independent of which font wins — needs
only T1's `setTheme`, so it can run while Daniel reviews on the iPad.

- [ ] implement
- [ ] acceptance: cycles and persists across reload, correct on first paint;
      `bun run ci`

## T3 — iPad word gesture [tier: med]

`bookplayer-word-gesture-ipad`. CONFIRMED broken (Daniel, 2026-08-18: double-tap
does nothing). `EpubReader.tsx` registers `dblclick` per content document inside
`hooks.content` (line ~391); touch never delivers it.

Two hazards, both real:

- `resolveDblClickPoint` (line ~143) prefers the native selection `dblclick`
  produces — touch produces none, so the touch path must drive the existing
  `caretRangeFromPoint` fallback (already in that function) from the tap
  coordinates.
- Safari's double-tap-to-zoom will compete for the gesture.

Follow-disengage on word activate was considered and DECLINED (Daniel,
2026-08-18): keep the deliberate behavior documented at `$bookId.tsx:156-161` —
a seek re-syncs playback, follow stays engaged. Do not change it.

- [ ] confirm the mechanism (does any touch event reach the content document?)
- [ ] implement the touch path, reusing `resolveDblClickPoint`
- [ ] acceptance: Daniel taps a word on the iPad and the audio seeks there;
      desktop dblclick still works unchanged; `bun run ci`

## T4 — cleanup, after Daniel's pick [tier: low]

Design §10 task 3: delete the dev-only font cycle and its content hook, drop
non-winning font assets, hardcode the chosen stack into the `light`/`dark` rule
objects (no runtime font lever ships), harvest anything durable from the design
into `EpubReader.tsx` comments, then delete the design per the workflow's Design
closing convention.

- [ ] Daniel picks the font and confirms the palettes on device
- [ ] implement
- [ ] acceptance: no dev-only code paths left; `bun run ci`

Sequencing: T1 -> (T2 ‖ Daniel's device review) -> T3 -> T4 last, since T4 is
gated on the font pick. T3 is independent of the theming work and could move
earlier if the device pass is convenient to combine.
