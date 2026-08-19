# bookplayer-reader-theming — design

Status: proposed, 2026-08-18 (revised after coordinator/Daniel review, same
day). Backlog: [bookplayer-reader-theming](../BACKLOG.md) (`## player-ux`,
scheduled in `## Now`). No code changes made by this doc.

## 1. Problem

`EpubReader.tsx:372-375` hardcodes one `rendition.themes.default({...})` call
(slate body text, cyan links, both `!important`) applied to every book,
regardless of the book's own stylesheet, and every book renders in whatever font
its own EPUB CSS specifies. Daniel wants a toolbar control that lets him force a
light or dark reading surface (vs. the book's own styling) and override the
book's font with a chosen reading face, evaluated from a shortlist (Iowan Old
Style, Charter, Literata, Georgia) down to exactly one before shipping.

## 2. Constraints (verified against installed epub.js 0.3.93 source)

- **One touchpoint.** `EpubReader.tsx`'s header states it is the only place
  epub.js is touched; `ReaderToolbar.tsx:1-8` states it is deliberately dumb —
  it drives only `ReaderController` and the search-open flag. Any new control
  must extend `ReaderController` and receive display state the same way
  `toc`/`controller` already flow: `EpubReader` -> route
  (`routes/player/$bookId.tsx`) -> `ReaderToolbar`.
- **Themes API surface** (`apps/bookplayer/node_modules/epubjs/src/themes.js`):
  `register`/`default` add named theme rule sets; `select(name)` switches the
  active theme and adds a CSS class to rendered content;
  `override(prop, value, priority)` sets an inline style on `content` (the
  section's `<body>`, see `contents.js:251-261` `css()`) — this is what
  `themes.font()` and `themes.fontSize()` call under the hood
  (`themes.js:246-256`). `add()` (`themes.js:181-197`) injects either a `<link>`
  (URL theme), or a generated `<style id="epubjs-inserted- css-<name>">`
  (rules/CSS-string theme) into the section's `<head>` via
  `contents.addStylesheetRules`/`addStylesheetCss` (`contents.js:750-830`ish,
  `_getStylesheetNode` at `contents.js:728-743`). **All of this only reaches the
  epub.js content iframe — it has no effect on anything React renders outside
  that iframe** (see §3).
- **Iframe origin.** Sections render in an `about:srcdoc` iframe with
  `sandbox="allow-same-origin"` (`managers/views/iframe.js:93-99`, no
  `allow-scripts` unless `allowScriptedContent` is set — it isn't here, which is
  why the ebook-renderer ticket's "blocked-script warning" is expected).
  `allow-same-origin` on a `srcdoc` iframe makes it inherit the parent
  document's origin (spec behavior), so a same-origin absolute path like
  `/fonts/x.woff2` is fetchable from inside the content iframe with no CORS
  wrinkle. A path starting with `/` also sidesteps any `<base>` element the
  book's own XHTML head might carry, which would otherwise skew _relative_ URL
  resolution for `@font-face` (our `<style>` tag lands in the same document
  `<head>`, so it shares whatever base the section's own markup set).
- **Static asset serving.** `apps/bookplayer/public/` is a plain Vite public dir
  already serving `favicon.ico`/`robots.txt` at the site root
  (`apps/bookplayer/vite.config.ts` has no rewrite for it); nitro's handler list
  (`vite.config.ts:16-35`) covers only the `/api/*` routes, so
  `public/fonts/<name>.woff2` would serve at `/fonts/<name>.woff2` with zero new
  server code.
- **Font-load reflow gap.** `contents.js:574-583` defines `fontLoadListeners()`
  (waits on `document.fonts.ready`, then calls `resizeCheck()`), but it is
  commented out at the call site (`contents.js:387`,
  `// this.fontLoadListeners();`). epub.js's paginated layout is
  column-width-based; text reflow from a _newly loading_ webfont does not
  trigger any automatic re-check — the `ResizeObserver` path
  (`contents.js:395-400`) only fires on iframe/container size changes, not on
  in-place text metric changes. A system font (already loaded, synchronous) has
  no such gap; a self-hosted webfont (Literata) does, until we force a
  repagination ourselves (see §5, decision 6).
- **No CI-integrated browser harness.** `bookplayer-public-acceptance` is still
  open — there is no local Playwright pass on this app. Visual verification is
  manual (Daniel's iPad, Brave desktop).
- **Dev environment for on-device checks.** Daniel runs
  `bun run dev --host 0.0.0.0` and has the client already loaded on the iPad
  over LAN — anything expressed as plain React state (not a URL param requiring
  a reload) reaches the device live, with no rebuild or deploy. The iPad has no
  devtools console and no attached keyboard, which rules out anything requiring
  typing or console use as the on-device comparison mechanism (see §8).

## 3. What "book default" vs. "forced theme" actually means

Today's single hardcoded theme (`EpubReader.tsx:372-375`) forces exactly two CSS
properties — `body { color }` and link color — on top of whatever the book's own
stylesheet already does. Everything else about the rendered page — font family,
size, line height, margins, headings, blockquotes, pull-quotes — is still
entirely the book's own CSS, unmodified, today. So "book default" as an
off-state is a **two-property delta** from what ships now, not an unexplored
rendering path: removing those two forced rules just turns off a small
legibility guard, it doesn't introduce new untested territory.

What that guard actually buys, concretely: some books set a pale gray body
color, or a text color that assumes a background color the book also sets (and
which our dark app shell doesn't provide), which reads washed-out or
low-contrast on our white reading pane. That's the only real risk of the
off-state, and it's self-correcting in the shipped UI — Daniel notices and
cycles the toolbar button to `light` or `dark`.

Nothing from today is lost. The proven `#1e293b` text / `#0e7490` link values
survive unchanged as the **light** theme (plus the chosen font — see §6). The
three states are:

1. **Book default** — no injection at all; the book's own CSS fully governs text
   color, links, font, everything.
2. **Light** — today's baseline colors (`#1e293b` text, `#0e7490` links) +
   chosen font.
3. **Dark** — inverted palette (see §6) + chosen font.

CSS mechanics, unchanged from the original analysis: `!important` inline styles
(from `themes.override`, used for the font swap) and `!important` rules in a
generated `<style>` tag (`themes.select`'s rule-object themes) both out-rank the
book's own non-`!important` CSS regardless of selector specificity. Two things
it does _not_ override:

- Any book CSS that **also** uses `!important` on the same property at higher
  specificity than our selector (body-level, or an inline `style` attribute in
  the book's markup) — rare in practice for trade EPUBs, but not impossible
  (some readers/producers hardcode `!important` on cover pages).
- Inline `<span style="color:...">` runs and inline-styled elements: a
  `body { color }` override does not touch descendant text that carries its own
  inline `color`. Pre-styled backgrounds behave the same way (a `dark` theme
  setting `body { background }` won't paint over an element with its own
  inline/`!important` background — e.g. a colored pull-quote box, cover art).
  Not fixable generically without walking the DOM; accept as a known gap, same
  class of imperfection the ticket already accepts for epub.js.
- Images: unaffected either way — theming is a text/background concern only.

## 4. The reading pane background is app-side, not epub.js-side

`EpubReader.tsx:742-749` (unchanged content, confirmed on this pass):

```tsx
// Outer clipping only — no styles on epub.js internals.
return (
  <div
    ref={containerRef}
    className="h-full w-full overflow-hidden bg-white"
    data-testid="epub-reader"
  />
);
```

This `<div>` is the element `book.renderTo(container, ...)` mounts the epub.js
manager into (`EpubReader.tsx:364`) — it wraps the content iframe(s), and it
carries a hardcoded `bg-white` that `rendition.themes` cannot touch: the Themes
API (§2) only injects CSS into the content _document inside_ the iframe. Forcing
a dark theme via `themes.select("dark")` alone would produce dark pages floating
inside a permanently white frame — visibly broken, not just imperfect. This was
missed in the first pass of this design; caught on review.

**Consequence:** theme state cannot live purely inside the imperative
epub.js/rendition world (refs, `useEffect`-only) the way CFI position does — it
has to be React state in `EpubReader`, because it drives two independent things:
the injected content-iframe CSS (imperative, via `rendition.themes.select`)
**and** this wrapper `<div>`'s own `className` (reactive, via normal React
re-render). Concretely:

- Add `const [theme, setTheme] = useState<ThemeName>(() => readStoredTheme())`
  in `EpubReader`, with `readStoredTheme()` a synchronous `localStorage.getItem`
  read (same key as before, `bookplayer:reader-theme`). A `useState` **lazy
  initializer** runs synchronously during the component's first render, before
  anything paints — so the very first frame already has the right wrapper class.
  This directly answers the "does this change when the localStorage read
  happens" question: yes — it moves from "read inside the async `init()` effect,
  after `book.ready`" to "read synchronously on first render," specifically to
  avoid a white flash before a dark preference ever gets applied. The imperative
  `init()` effect then reads this same initial value (via a ref, same pattern
  already used for `bookIdRef`, `EpubReader.tsx:197-198`) to call
  `rendition.themes.select(...)` once the rendition exists — it does not re-read
  localStorage a second time.
- The returned `<div>`'s `className` becomes conditional on `theme`:
  `theme === "dark" ? "... bg-slate-900" : "... bg-white"` (book-default and
  light both keep today's `bg-white` — see palette rationale in §6; only dark
  needs a different wrapper color).
- `ReaderController.setTheme(name)` (§5, decision 5) updates all of: the
  `rendition.themes.select(name)` call, the `theme` state (which repaints the
  wrapper div), the `themeKey()` localStorage write, and fires
  `onThemeChange(name)` up to the route so `ReaderToolbar` can render current
  state — the controller method is the single place all four happen together, so
  they can never drift out of sync.

**Toolbar/chrome coherence — checked, no other surface needs this treatment.**
The header (`$bookId.tsx:216,220`), `ReaderToolbar.tsx:31`, and
`SearchPanel.tsx:48,101` are all permanently `bg-slate-900` (or a translucent
variant of it) regardless of reading theme — that's existing, unchanged
behavior; only the reading pane itself (the wrapper div + its iframe content)
should theme. Two consequences worth stating explicitly, since they answer the
coordinator's coherence question directly:

- **Light theme under a dark toolbar is coherent — it's what ships today,
  unchanged.** The wrapper stays `bg-white` for both `default` and `light`; the
  app already renders a white reading rectangle inset in a dark chrome bezel
  right now (that's the current, shipped look, not a new design smell this work
  introduces).
- **Dark theme is the one new visual: the wrapper's `bg-slate-900` exactly
  matches the header/toolbar's own `bg-slate-900`**, so choosing dark makes the
  reading pane visually merge with the surrounding chrome — no seam, no separate
  "frame" — which reads as the more natural pairing for that state.
- `SearchPanel` is an absolutely-positioned overlay floating _over_ the reader
  pane (`SearchPanel.tsx:48`, `absolute inset-x-0 top-0`), not part of the page
  surface itself — it stays dark-chrome regardless of reading theme, same
  treatment as the toolbar/header. No change needed there.
- The `Suspense` "Loading EPUB…" fallback (`$bookId.tsx:328-334`) renders inside
  the same wrapper `main`/`div` structure but **before** `EpubReader` itself has
  mounted, so the themed wrapper div doesn't exist yet during that window — the
  surrounding chrome (already `bg-slate-900`) is what shows, so there's no
  separate flash to solve there either.

## 5. Alternatives considered

**A. Two-state toggle** (Daniel's proposed floor): "custom" (forced theme +
font) vs. "book default." Simplest possible; doesn't cover the explicit ask for
_both_ light and dark forced surfaces — would need a second control (or a
settings sub-choice) for which forced polarity to use, which just re-invents a
3-state control with extra steps.

**B. Independent theme + font knobs** (2×N combinations: any theme × any font).
Rejected — Daniel is explicit that the font question resolves to exactly one
face, deleted losers, no picker ships. Building an independent font selector is
work for a control surface that's supposed to not exist after this ships.

**C. Three-state cycle: book default -> light -> dark -> (back to default).**
One button, `aria-pressed`/icon state shows the current mode, matches the
existing `followReader`/`alignOpen` toggle idiom in `$bookId.tsx:220-252` (icon
button, `text-cyan-400` when active, `aria-pressed`). Font is _coupled_ to the
two forced themes (not book default) — satisfies "forced theme + our font"
without a separate control. **Chosen.**

## 6. Decisions

1. **Theme model — three named epub.js themes**, registered once at `rendition`
   creation in place of the current line 372-375 call:
   - `default`: no rules at all (true book CSS, replacing today's forced
     slate/cyan — see §3).
   - `light`: today's proven colors + `font-family` override (the winning face),
     `!important` — see §7 for exact values.
   - `dark`: inverted palette + the same `font-family` override — see §7 for
     exact values.

   Switching is `rendition.themes.select(name)`. This uses `select`, not
   `override`+`default`, so book default has genuinely zero injected CSS.

2. **Font IS an independent preference — REVISED 2026-08-18 after Daniel's
   on-device pass.** The original decision was that one face wins and gets
   hardcoded, no font UI. Daniel tried all four in the reader and liked several:
   Charter best (denser), Iowan good, Georgia "a bit too serif'y", Literata "a
   bit too spread out". No obvious winner, so rather than force a premature
   pick, the font cycle is PROMOTED from the dev-only affordance to a real
   toolbar control and lives in production while he reads with it for a few
   days.

   - **Literata is dropped** (Daniel's call): it is the only non-system face, so
     keeping it would mean shipping a woff2 plus OFL attribution, and it carries
     the font-load reflow gap from §2 — not worth it for the candidate he rated
     lowest. Delete `public/fonts/literata-regular.woff2` and its dev-only
     `@font-face` content hook.
   - Shipping cycle is therefore three system faces: **Iowan -> Charter ->
     Georgia**.
   - The font override applies only under `light`/`dark`, never under book
     default, so the off-state stays honest. NOTE this differs from the dev
     affordance, where `themes.font()` layered over any state including default.
   - Collapsing to a single face later stays open (see §10 task 4), but is no
     longer part of this plan's scope — it needs Daniel's verdict after real
     use, not a design decision now.

3. **Persistence — global, not per-book**, one new localStorage key alongside
   the existing per-book `cfiKey` helper (`EpubReader.tsx:169-171`):

   ```ts
   function themeKey(): string {
     return "bookplayer:reader-theme";
   }
   ```

   REVISED 2026-08-18: the promoted font cycle (decision 2) needs the same
   treatment — a second global key `bookplayer:reader-font` holding the chosen
   face's label, read by the same kind of lazy `useState` initializer. It does
   NOT need the wrapper-repaint coupling that the theme key has (§4), since a
   font affects only content inside the iframe, so there is no first-paint flash
   to avoid — but reading it lazily keeps the two preferences symmetrical.

   storing the bare string `"default" | "light" | "dark"`. Global because a
   reading-face/theme preference is a property of the reader, not the book —
   unlike CFI position, which inherently is book-scoped.

4. **Wrapper background is React state, not purely imperative** (§4). Theme
   state lives in `EpubReader` as `useState`, lazily initialized from
   localStorage so the first paint is already correct (no flash), and drives
   both the wrapper `<div>`'s `className` and (via the controller, next
   decision) the injected content-iframe CSS.

5. **Controller surface.** Add one method to `ReaderController`
   (`EpubReader.tsx:75-98`):

   ```ts
   setTheme: (name: "default" | "light" | "dark") => void;
   ```

   implemented to do all four things atomically (§4): call
   `rendition.themes.select(name)`, call the local `setTheme` React state setter
   (repaints the wrapper div), write `themeKey()` to localStorage, and invoke
   `callbacksRef.current.onThemeChange(name)`. Add the matching
   `onThemeChange: (name) => void` prop to `EpubReaderProps`, alongside
   `onController`/`onToc`/`onSearchState`, fired once on init (with the
   localStorage-derived initial value) and again on every `setTheme` call —
   mirrors how `onToc` already reports state the toolbar needs to render. The
   route (`$bookId.tsx`) holds `[theme, setThemeState]` in `useState` (its own
   copy, driven by `onThemeChange`), and passes `theme` + a `cycleTheme`
   callback down to `ReaderToolbar`, same plumbing shape as `toc`/`controller`
   today.

6. **Mid-read theme change and repagination.** `themes.select()` injects CSS
   directly into already-rendered content (`themes.js:145-150`, `update` loops
   `rendition.getContents()`) — it does not itself call `rendition.display()`.
   For a **system font** (no network fetch, synchronous swap) the existing
   pagination is very likely still visually correct immediately, but column
   boundaries were computed under the old font metrics, so text can be clipped
   or leave a gap at the page edge. For a **webfont** the risk is worse: the
   font-load-listener gap in §2 means epub.js won't even notice the swap once it
   completes. Fix: after `select()`, force a redisplay of the current position
   through the _existing_ latest-wins scheduler (`EpubReader.tsx:239-241`,
   `displayScheduler`) — the same mechanism already used to re-show
   `resumeTarget.cfi` after a container resize (`EpubReader.tsx:486-494`).
   Concretely: `setTheme` calls `rendition.themes.select(name)`, reads
   `rendition.currentLocation()`'s start CFI, and runs it through
   `displayScheduler`, exactly paralleling the resize-observer callback. This
   reuses proven machinery instead of adding a second repagination path, and
   keeps the current reading position (no scroll-to-top surprise).

7. **Toolbar control.** One icon button in `ReaderToolbar.tsx`, positioned
   before the Chapters select (leftmost of the style/nav cluster, since it's a
   persistent surface setting rather than a per-visit navigation action).
   Three-way cycle on click (`default -> light -> dark -> default`), icon swaps
   by state (e.g. lucide `BookOpenText`/`Sun`/`Moon`, or a single `Palette` icon
   with `aria-pressed`/color state like the existing `followReader` button) —
   final icon choice is a wiring-review call, not a design blocker; match the
   existing `text-slate-400` / `text-cyan-400` active-state convention used
   everywhere else in this toolbar and the top bar. `aria-label` cycles with
   state ("Reading theme: book default — tap for light", etc.) for
   accessibility, matching the pattern already used for the follow/align buttons
   in `$bookId.tsx`.

8. **`bookplayer-ebook-renderer` revisit trigger:** does NOT trip. The Themes
   API cleanly supports named theme sets, `!important` overrides, and
   per-section-load re-injection without any epub.js internals workaround beyond
   the font-load-listener gap already covered by reusing the `displayScheduler`
   redisplay, and the wrapper-background gap already covered by lifting theme to
   React state (§4). No search/highlight-class limitation surfaced. The ticket's
   "revisit-when" stays open for future search/highlight reliability issues
   only.

## 7. Concrete starting palettes and fonts

Daniel validates all of these by eye on a real book, on-device, while the work
runs (§8) — these are starting points to implement against, not final
pixel-perfect specs. The values below are what gets registered into the
`light`/`dark` themes so the on-device comparison (§8) is judging the real
rendering path — epub.js pagination, the book's own CSS underneath, our
`!important` overrides on top — not a proxy for it.

### Palettes

**Light** — keep today's values as-is; they're already proven legible in
production:

| Role       | Value                 | Note                                      |
| ---------- | --------------------- | ----------------------------------------- |
| Background | `#ffffff`             | Matches the existing wrapper `bg-white`.  |
| Body text  | `#1e293b` (slate-800) | Unchanged from today's hardcoded default. |
| Links      | `#0e7490` (cyan-700)  | Unchanged from today's hardcoded default. |

Optional nice-to-have, not required: a slightly warm off-white (e.g. `#fafaf9`,
Tailwind stone-50) instead of pure `#ffffff` is a common "paper" tweak (Apple
Books/Kindle both offer one) some readers prefer for long sessions — worth a
glance during the on-device check, not a blocker.

**Dark** — proposed, new:

| Role       | Value                 | Reasoning                                                                                                                                                                                                                                                                                                |
| ---------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background | `#0f172a` (slate-900) | Matches the app chrome exactly (header/toolbar are already this color, `$bookId.tsx:216,220`, `ReaderToolbar.tsx:31`) — not pure black, avoids OLED/contrast crush while making the reading pane merge seamlessly with the surrounding shell (§4).                                                       |
| Body text  | `#e2e8f0` (slate-200) | Deliberately not pure white (`#ffffff`) — pure-white text on a dark field over a large reading block is a known contrast/glare fatigue source; a light gray keeps contrast comfortably above WCAG AA against `#0f172a` without the halation.                                                             |
| Links      | `#22d3ee` (cyan-400)  | Reuses the app's own existing active-state accent (`text-cyan-400`, used for the follow/align toggle buttons in `$bookId.tsx:241,259`) rather than inventing a new hue; brighter than the light theme's `#0e7490` because that value was tuned for a white background and would be low-contrast on dark. |

### Fonts

Daniel's stated preference is Iowan Old Style (from Apple Books), explicitly
**not** a hard requirement — all four get evaluated on-device. Exact
`font-family` CSS stack to register for each, plus availability:

| Face                | Proposed `font-family` stack                                       | System face?                                                      | Platform notes                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Iowan Old Style** | `"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif` | Yes — macOS + iOS                                                 | No webfont, no reflow gap (§2). Not present on Windows/Linux/Android; the stack falls back to Palatino then Georgia there, but Daniel's devices (iPad, Brave-on-Mac — Brave has no bundled font list, it uses OS fonts) are exactly the platforms it ships on. |
| **Charter**         | `Charter, "Bitstream Charter", "Sitka Text", Cambria, serif`       | Yes — macOS (bundled since Catalina)                              | iOS availability is genuinely unclear from source alone — sources disagree; **needs the on-device check**, unlike Iowan Old Style/Georgia.                                                                                                                     |
| **Georgia**         | `Georgia, "Nimbus Roman No9 L", serif`                             | Yes — effectively universal (Windows + macOS + iOS all bundle it) | Safest fallback regardless of final pick; zero webfont, zero reflow gap.                                                                                                                                                                                       |
| **Literata**        | `Literata, Georgia, serif`                                         | No — Google variable serif, not preinstalled anywhere             | Requires a self-hosted `.woff2` under `public/fonts/` (§2) and inherits the font-load reflow gap (§2, §6 decision 6) — the redisplay-after-select fix must be solid for this candidate specifically, more so than for any system face.                         |

**Recommendation: Iowan Old Style**, for the reasons above — it's a genuine
system face (no asset, no reflow gap, no maintenance) on exactly the two
surfaces Daniel actually reads on, and it's already his stated preference from
daily use in Apple Books. Georgia is the natural safety net already baked into
its fallback stack. Literata is the only candidate that adds real implementation
risk (webfont hosting + the reflow gap) for a face nothing else in this design
depends on — pick it only if it wins the on-device comparison outright.

## 8. Comparing candidates: in the reader, on a real book, not a swatch page

**Rejected: a standalone `/lab` swatch route rendering sample paragraphs in the
main document.** That was the original proposal here and it's wrong, caught on
review: a swatch renders in the app's own top-level document, but the thing
being judged — a font, at a color, against a background — only means something
inside the epub.js **content iframe**, under the book's own CSS, at epub.js's
actual pagination/margins/column width, with our `!important` rules layered on
top of whatever the book didn't override. A typeface that reads cleanly in an
isolated `<p>` can land completely differently once the book's own
`line-height`, paragraph spacing, and heading rules apply — rules this design
deliberately does NOT touch (§3). Same for the palettes: a swatch can't show the
known gap from §3 — where a book's own inline-styled span or `!important` rule
survives our override — because a swatch has no book CSS underneath it to
conflict with. Comparing swatches would validate a different rendering path than
the one that ships.

**Chosen: cycle the real candidates live, inside the reader, over an actual open
book.** Concretely:

- The theme model (§6) already needs a `light`/`dark` registration and a
  repagination-safe `setTheme` (decision 6) — extend that same machinery,
  dev-only, to also cycle the **font** independently of theme: a temporary
  dev-only affordance, gated `import.meta.env.DEV` (same idiom as the existing
  `lab` link, `$bookId.tsx:270-277`), that calls `rendition.themes.font(stack)`
  — the exact epub.js primitive built for this (`themes.js:254-256`,
  `override("font-family", f, true)`) — cycling through the four candidate
  stacks from §7. `themes.font()` applies as an override layered on top of
  whichever theme (`default`/`light`/`dark`) is currently selected, so Daniel
  can try a candidate against book-default, light, and dark without the two
  levers interfering.
- For Literata's `@font-face`, a temporary dev-only `rendition.hooks.content`
  registration injects the declaration (pointing at a temporarily self-hosted
  `/fonts/literata-regular.woff2`) into every loaded section — same mechanism
  already used for the dblclick listener (`EpubReader.tsx:391`), so it's present
  regardless of which theme is active.
- Every font cycle re-runs the same post-select redisplay (§6, decision 6) so
  paging position is preserved across candidates — Daniel can land on one page
  of one chapter and flip through all four fonts without losing his place or
  re-navigating.

**On-screen tap control, not a query param — and not a rebuild.** Daniel's
environment: `bun run dev --host 0.0.0.0` already running, the iPad already has
the client loaded over LAN, so anything that's plain React state is
hot-reloadable and reachable with zero rebuild/deploy. Two candidate mechanisms,
both viable in principle, only one fits his device:

- **Query param** (e.g. `?readerFont=charter`) — rejected. Changing it means
  editing the URL bar and reloading the page, which re-runs `EpubReader`'s whole
  `init()` lifecycle (keyed to `epubUrl` only, by the component's own stated
  rule) — that reopens the book and loses the exact page he's comparing across
  candidates, defeating the point of a live in-place comparison. It also
  requires typing on an on-screen keyboard for every switch, on a device the
  constraint list already flags as console-less and keyboard-less for anything
  else.
- **On-screen tap control** — chosen. A temporary dev-only button (or a
  press-and-cycle on the existing theme button, dev-build only) that calls the
  font-cycle lever above needs no typing, no reload, and preserves position via
  the same redisplay path already built for the production toggle. It's also the
  same interaction idiom the rest of this toolbar already uses (tap-to-cycle
  icon buttons), so it costs nothing conceptually new.

Reach it from the iPad over the already-running LAN dev server, and from Brave
desktop the same way — no deploy, no Playwright, no separate harness.

Everything else (does `!important` actually beat this specific book's CSS, do
the proposed palette values actually look right at reading size against real
book content, does the post-theme-change repagination fix actually avoid a
visible jump, does the dark wrapper genuinely read as seamless against the
toolbar) is Daniel-eyeballs-it territory by the same mechanism — no harness
exists to check it automatically (`bookplayer-public-acceptance` still open).

## 9. Open questions

- Exact `font-family` CSS string match / actual glyph availability for Iowan Old
  Style and Charter on iOS specifically (vs. macOS) — resolve during the
  on-device comparison, not before.
- Final palette values (§7) are starting points; Daniel may retune any of the
  six hex values by eye during execution.
- Icon choice for the toolbar cycle button — deferred to implementation/wiring
  review, not a design blocker.
- Whether `bookplayer-word-gesture-ipad` ships in the same plan (BACKLOG says
  "ships in one plan with bookplayer-reader-theming") — that item's dblclick
  touch-equivalent work is unrelated in mechanism (DOM event handling, not
  epub.js themes) and out of scope for this design; the plan-writing step should
  decide whether to fold both into one `plans/bookplayer-reader- theming.md` or
  keep them as separate plan steps sharing one commit sequence.

## 10. Implementation tasks

1. **[tier: med] Theme model + controller wiring + dev-only on-device font
   comparison, in `EpubReader.tsx`.** Replace the line 372-375
   `themes.default(...)` call with
   `themes.register({ default: {}, light: {...}, dark: {...} })` using the
   proposed palette from §7 with Iowan Old Style as the initial font; add a
   `useState`-backed theme with a lazy localStorage-reading initializer (§4, §6
   decision 4) driving the wrapper `<div>`'s `className`; add
   `themeKey()`/localStorage write-on-select (mirrors `cfiKey`,
   `EpubReader.tsx:169-171` and the `relocated` handler at `377-383`); add
   `setTheme` to `ReaderController` and `onThemeChange` to `EpubReaderProps`
   (§6, decision 5); wire the post-`select()` redisplay through the existing
   `displayScheduler` using `rendition.currentLocation()`'s start CFI (§6,
   decision 6). In the same task, add the temporary dev-only comparison
   affordance from §8: an `import.meta.env.DEV`-gated on-screen tap control
   cycling `rendition.themes.font(stack)` through the four candidate stacks
   (§7), a dev-only content hook injecting Literata's `@font-face` (pointing at
   a temporarily self-hosted `public/fonts/literata-regular.woff2`), and the
   same post-change redisplay reused for the font cycle. Acceptance: switching
   theme mid-read preserves reading position and repaints the wrapper background
   with no flash on load; book-default genuinely shows unstyled book CSS; on the
   iPad (already on the LAN dev server, per §2) Daniel can tap through all four
   fonts against light/dark/default on a real open chapter, no typing, no
   reload, no lost position; `bun run ci` green.

2. **[tier: low] Toolbar control in `ReaderToolbar.tsx` + route plumbing (the
   production default/light/dark cycle).** New icon button, 3-way cycle,
   `aria-pressed`/`aria-label` per state; `$bookId.tsx` holds theme state
   (driven by `onThemeChange`) and passes it + the cycle callback down, same
   shape as existing `toc`/`controller` props. Mechanical — the pattern already
   exists three times in this codebase (`followReader`, `alignOpen`, the
   Chapters select). Independent of which font Daniel ultimately picks, so it
   doesn't need to wait on his on-device review — only on task 1's `setTheme`
   existing. Acceptance: button visible beside Chapters/pager/search, cycles and
   persists across a reload (localStorage round-trip, correct on first paint),
   `bun run ci` green.

3. **[tier: low] Cleanup, after Daniel's on-device pick.** Delete the dev-only
   font-cycle affordance and its content hook, delete any non-winning font
   assets from `public/fonts/` (keep Literata's `.woff2` only if it won),
   hardcode the chosen `font-family` stack directly into the `light`/`dark`
   theme rule objects from task 1 (§6, decision 2 — no runtime font lever
   ships), and fold any durable facts from this design that aren't otherwise
   obvious from the code into `EpubReader.tsx` comments (per `docs/workflow.md`
   Design section closing convention).

Sequencing: 1 first (builds the real theme machinery and the on-device
comparison affordance together — Daniel validates on the iPad against task 1's
build, no separate step needed); 2 can happen anytime after 1, in parallel with
Daniel's review, since it doesn't depend on which font wins; 3 last, once Daniel
has picked. Each task gets its own commit, quality gate green before each, per
`docs/workflow.md`.
