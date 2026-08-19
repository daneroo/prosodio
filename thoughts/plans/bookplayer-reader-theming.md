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

## T2 — production toolbar controls + route plumbing [tier: med]

REVISED after Daniel's on-device pass (design §6 decision 2): TWO controls, not
one, and the font cycle is now production rather than dev-only.

`ReaderToolbar.tsx` gains, beside Chapters/pager/search:

- a **theme cycle** — book default -> light -> dark. All three states stay
  (Daniel confirmed): book default is the escape hatch when a theme breaks a
  book.
- a **font cycle** — Iowan -> Charter -> Georgia. Literata DROPPED: the only
  non-system face, so keeping it means shipping a woff2 + OFL attribution and
  carrying the §2 reflow gap, for the candidate Daniel rated lowest. Delete
  `apps/bookplayer/public/fonts/literata-regular.woff2` and its dev-only
  `@font-face` content hook in this task.

Promote the control out of `EpubReader.tsx` and delete the dev overlay — it
lived in the pane only because T1 was scoped out of the toolbar. Font choice
persists under `bookplayer:reader-font` with the same lazy-initializer shape as
the theme key; `setFont` on `ReaderController` mirrors `setTheme` including the
post-change redisplay. Font applies under light/dark ONLY, never book default,
unlike the dev affordance which layered over every state.

`routes/player/$bookId.tsx` holds both bits of state and passes them down, same
shape as `toc`/`controller`.

Tiered up from low: two controls, a second persisted preference, a new
controller method and an asset removal is no longer mechanical.

- [x] implement
- [ ] acceptance: both cycles persist across reload and are correct on first
      paint; font applies under light/dark but not book default; no dev overlay
      and no Literata asset remain; `bun run ci` green — awaiting Daniel's
      on-device pass

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

## T4 — collapse or keep, after Daniel lives with it [tier: low]

REVISED: the dev overlay and the Literata asset come out in T2, so T4 is only
the optional collapse. After a few days of real reading Daniel either (a) names
a clear winner — the cycle collapses to that one face hardcoded in the
`light`/`dark` rules and the toolbar font control goes away — or (b) keeps the
three-way cycle as a shipped feature. Either way: harvest anything durable from
the design into `EpubReader.tsx` comments, then delete the design per the
workflow's Design closing convention.

T4 is NOT blocking. T1+T2 are a complete, shippable state on their own.

- [ ] Daniel reads with it for a few days and decides: collapse or keep
- [ ] implement whichever
- [ ] acceptance: `bun run ci`

Sequencing: T1 (done) -> T2 -> T3. T4 last and non-blocking, gated on Daniel
living with the font cycle. T3 is independent of the theming work throughout.
