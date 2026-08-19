# bookplayer-reader-theming — reader theming + iPad word gesture

Status: done

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
- [x] acceptance: confirmed on iPad ("looks great"). Font control also had to
      read "Book" and disable under book default, where no override applies.

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

- [x] confirm the mechanism (does any touch event reach the content document?)
- [x] implement the touch path, reusing `resolveDblClickPoint`
- [x] acceptance: works on all surfaces on iPad. NOT the gesture code that was
      broken — WebKit bug 218086: no events reach a sandboxed iframe's document
      without `allow-scripts`. Three confident fixes failed before instrumenting
      the device settled it; see the retro note below.

## T4 — DROPPED (Daniel, 2026-08-19)

The font cycle ships as a permanent feature. No collapse-to-one-face task:
Daniel may keep the three-way cycle indefinitely, and if he ever does want it
reduced that's a new backlog item, not scheduled work here.

Sequencing: T1 (done) -> T2 (done) -> T3. Nothing follows T3.

## Retro (kept deliberately — the expensive lesson)

Three fixes were written and shipped for this gesture before anyone looked at
the device: a touch double-tap detector, `touch-action: manipulation`, and a
`user-select: none` change premised on an on-device report that was never
actually made. All three were plausible, all three were wrong, and desktop
Chrome passed every time — synthetic touch exercises our own logic and says
nothing about WebKit's iframe event gating.

What worked was instrumenting the real device: an on-screen readout plus a
beacon to the dev server, which showed the host document receiving every event
and the content document receiving none. That pointed straight at the sandbox,
and a web search then found the WebKit bug in one hit. Daniel had asked for
external references early; doing that first would have saved the whole detour.

Rules earned here, worth carrying into `bookplayer-public-acceptance`:

- A desktop browser cannot validate an iOS gesture. Don't claim it can.
- A diagnostic you can't distinguish from a missing diagnostic is worse than
  none — the first overlay was an empty 8px sliver, invisible everywhere, and
  cost a round trip proving nothing.
- Search for prior art on platform quirks BEFORE writing the fix.
