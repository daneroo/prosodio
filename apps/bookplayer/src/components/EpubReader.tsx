/**
 * epub.js reader. Owns the whole epubjs lifecycle (dynamic client-only
 * import) and pushes state up through callbacks; the player route owns the
 * chrome. Lessons encoded from the experiment record:
 * - load lifecycle keyed to epubUrl only — relocation must never re-open
 * - range CFIs are passed intact to both display and highlight; their common
 *   ancestor alone is not the range's start point
 * - only the outer container clips; epub.js internal scroll math is left
 *   alone, or highlights land off-screen
 * - on resize, the active search target is re-displayed so a reflow cannot
 *   lose the match (the desktop-to-mobile bug from visual review)
 */
import { useEffect, useRef, useState } from "react";

import {
  checkSectionParity,
  diagnoseRangeFromDomPath,
  normalizeText,
} from "@prosodio/align/browser";
import type {
  DomTokenLocator,
  SectionParityResult,
  SegPath,
} from "@prosodio/align/browser";
import type { Book, Contents, NavItem, Rendition } from "epubjs";

import { createLatestWins } from "#/lib/latest-wins";

export interface TocItem {
  label: string;
  href: string;
}

/** Three-state reading surface (plan T1, design §6 decision 1): `default` is
 * the book's own CSS with nothing injected; `light`/`dark` layer proven
 * colors + the reading font as `!important` overrides. Not per-book — a
 * reader preference, not a book property (design §6 decision 3). */
export type ThemeName = "default" | "light" | "dark";

/** The three reading faces Daniel is living with for a few days (plan T2,
 * design §6 decision 2 REVISED): no clear winner on-device, so all three
 * system faces ship as a real toolbar preference instead of collapsing to
 * one. Literata dropped — the only non-system face, not worth the woff2 +
 * reflow gap for the candidate he rated lowest. */
export type FontName = "iowan" | "charter" | "georgia";

export interface SearchResult {
  cfi: string;
  excerpt: string;
}

export interface SearchState {
  query: string;
  searching: boolean;
  results: Array<SearchResult>;
  activeIndex: number | null;
}

/** A single EPUB token's native DOM address (plan D7/P2): resolved directly
 * to a Range in the loaded section, no text re-projection. */
export interface EpubTokenLocate {
  spineHref: string;
  segPaths: Array<SegPath>;
  segTextLen: Array<number>;
  loc: DomTokenLocator;
  /** The token's raw source text, for the parity guard (see `locate`). */
  expectedRaw: string;
}

export type LocateResult =
  | { ok: true; cfi: string }
  | {
      ok: false;
      reason:
        | "reader-not-ready"
        | "section-not-found"
        | "section-load-failed"
        | "section-document-missing"
        | "section-parity-failed"
        | "range-path-failed"
        | "text-mismatch"
        | "cfi-generation-failed"
        | "unexpected-error";
      locator: EpubTokenLocate;
      details?: unknown;
    };

export interface ReaderController {
  prev: () => void;
  next: () => void;
  goTo: (href: string) => void;
  search: (query: string) => Promise<void>;
  gotoResult: (index: number) => void;
  clearSearch: () => void;
  /**
   * Resolve a captured DOM path locator to a Range in the loaded section and
   * highlight it (the alignment follow/"show in book" join, plan D7). Returns
   * a structured failure — no highlight, no fallback — when the path doesn't
   * resolve or the resolved text doesn't match `expectedRaw` (parser-parity
   * guard: the browser's parsed section DOM must structurally match the
   * server's extraction-time jsdom parse).
   *
   * Display discipline: displays go through a latest-wins scheduler (at most
   * one in flight; rapid follow collapses to the newest target), and a
   * target already on-screen skips display entirely (highlight only). A
   * locate whose display was superseded by a newer one still resolves
   * `ok: true` — the newer locate owns the screen; that is follow working,
   * not a failure.
   */
  locate: (locator: EpubTokenLocate) => Promise<LocateResult>;
  /**
   * Switch the reading theme (design §6 decision 5). Does all four things
   * atomically so they can never drift apart: selects the epub.js theme
   * (`themes.select`), repaints the wrapper `<div>` (React state — the
   * wrapper's background is app-side and outside anything `rendition.themes`
   * can reach, design §4), persists the choice globally, and reports it via
   * `onThemeChange`. Redisplays the current position through the existing
   * `displayScheduler` afterward (design §6 decision 6) so a font/color swap
   * can't leave stale pagination or lose the reading position.
   */
  setTheme: (name: ThemeName) => void;
  /**
   * Switch the reading font (plan T2, mirrors `setTheme` exactly): updates
   * React state, persists globally, reports via `onFontChange`, and
   * redisplays the current position — same four-things-atomically shape as
   * `setTheme`, same reasoning (design §6 decision 6).
   *
   * The one place this differs from `setTheme`: whether the change is
   * actually INJECTED depends on the current theme. `themes.font()` is
   * `themes.override("font-family", ..., true)` under the hood
   * (themes.js:254-256) — override state is global and independent of
   * `themes.select`, re-applied to every future content load by its own
   * content hook regardless of which theme is selected. Left unguarded, a
   * font choice made once would leak into `default` forever, breaking the
   * "book default is genuinely unstyled" guarantee (design §3, §6 decision
   * 1). So the font is only ever handed to `themes.font()` while `light`/
   * `dark` is selected; under `default` the standing override is actively
   * cleared instead. See `applyFont` below.
   */
  setFont: (name: FontName) => void;
}

export const EMPTY_SEARCH: SearchState = {
  query: "",
  searching: false,
  results: [],
  activeIndex: null,
};

/** A DOM point reported by a double-click in the reader (plan
 * player-sync-core S4): the section's epub.js href plus a text-node/offset.
 * The node belongs to the section's CAPTURE-PARSE (detached) document, NOT
 * the rendered iframe: the rendered view is about:srcdoc and thus always
 * text/html-parsed, while segPaths come from the capture parse (XML for
 * .xhtml), so the click point is bridged across that divergence via CFI
 * (rendered point -> CFI -> range in the detached document). Deliberately
 * artifact-agnostic — EpubReader knows nothing about spines/tokens; the
 * route maps this to a seek target via `seekTargetForBookPoint`
 * (player-sync.ts), same division of labor as `locate`. */
export interface WordActivatePoint {
  sectionHref: string;
  node: Node;
  offset: number;
}

interface EpubReaderProps {
  bookId: string;
  epubUrl: string;
  onController: (controller: ReaderController | null) => void;
  onToc: (items: Array<TocItem>) => void;
  onSearchState: (state: SearchState) => void;
  onError: (message: string) => void;
  /** Reverse-sync gesture (plan S4): dblclick in the reader reports the
   * clicked word's DOM point. Optional — omit to disable the listener
   * entirely (e.g. when the book has no alignment to map against). */
  onWordActivate?: (point: WordActivatePoint) => void;
  /** Fired once on init (with the localStorage-derived initial theme) and
   * again on every `ReaderController.setTheme` call — mirrors how `onToc`
   * reports state the toolbar needs to render (design §6 decision 5).
   * Optional: T1 wires the model, T2 wires the toolbar control that consumes
   * this. */
  onThemeChange?: (name: ThemeName) => void;
  /** Same shape as `onThemeChange`, for the font preference (plan T2): fired
   * once on init and again on every `ReaderController.setFont` call. */
  onFontChange?: (name: FontName) => void;
}

/**
 * Resolve the DOM point a dblclick (or double-tap, plan T3) landed on,
 * inside one section's content window (plan S4): dblclick natively selects
 * the clicked word, so prefer the selection's start point; fall back to
 * `caretRangeFromPoint` for browsers/cases where the selection didn't land
 * on a text node (e.g. the click missed text, or the caller is the touch
 * path below, which never produces a selection at all). Null means there's
 * nothing resolvable to report.
 *
 * Takes raw coordinates rather than a `MouseEvent` (plan T3) specifically so
 * the touch path can feed tap coordinates through this SAME machinery
 * instead of growing parallel coordinate-resolution logic — `dblclick` and
 * double-tap both bottom out here.
 *
 * `caretRangeFromPoint` only (no `caretPositionFromPoint` companion): that
 * matches what this function already did for the desktop `dblclick` path
 * pre-T3 (Safari/Chrome only, no Firefox fallback) — T3 doesn't widen that
 * gap, it just gives touch the same coverage desktop already had.
 */
function resolveDblClickPoint(
  win: Window,
  clientX: number,
  clientY: number,
): { node: Node; offset: number } | null {
  const selection = win.getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (range.startContainer.nodeType === range.startContainer.TEXT_NODE) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  const doc = win.document;
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(clientX, clientY);
    if (
      range &&
      range.startContainer.nodeType === range.startContainer.TEXT_NODE
    ) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

// Double-tap thresholds (plan T3): a second `touchend` within this window
// and this close to the first counts as a double-tap. 350ms sits between
// the ~300ms legacy tap-delay browsers used to use to disambiguate
// double-tap-to-zoom (so genuine double-taps aren't missed) and long enough
// to be a deliberate gesture, not two touches during a drag. 30px tolerates
// a finger not landing on the exact same pixel twice, while still failing a
// swipe/page-turn (epub.js paginated flow) or scroll, which move far more.
const DOUBLE_TAP_MS = 350;
const TAP_MOVE_PX = 30;

function tapDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

const MAX_RESULTS = 100;

function cfiKey(bookId: string): string {
  return `bookplayer:${bookId}:cfi`;
}

// Global, not per-book (design §6 decision 3): a reading-face/theme
// preference is a property of the reader, not the book — unlike CFI
// position, which is inherently book-scoped.
function themeKey(): string {
  return "bookplayer:reader-theme";
}

export const THEME_NAMES: ReadonlyArray<ThemeName> = [
  "default",
  "light",
  "dark",
];

/** Synchronous localStorage read for the `useState` lazy initializer (design
 * §4): must run before first paint so a dark preference never flashes white.
 * Any unrecognized/missing value falls back to "default" (today's book-CSS
 * baseline minus the old forced slate/cyan, see design §3). */
function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(themeKey());
    if (stored && (THEME_NAMES as ReadonlyArray<string>).includes(stored)) {
      return stored as ThemeName;
    }
  } catch {
    /* storage blocked — fall through to the default */
  }
  return "default";
}

// Global, not per-book (same reasoning as themeKey above): a reading-face
// preference is a property of the reader, not the book.
function fontKey(): string {
  return "bookplayer:reader-font";
}

export const FONT_NAMES: ReadonlyArray<FontName> = [
  "iowan",
  "charter",
  "georgia",
];

/** Synchronous localStorage read for the font `useState` lazy initializer,
 * same shape as `readStoredTheme` — no first-paint flash concern here (a
 * font only affects iframe content, design §6 decision 3), read lazily
 * anyway for symmetry with the theme preference. */
function readStoredFont(): FontName {
  try {
    const stored = localStorage.getItem(fontKey());
    if (stored && (FONT_NAMES as ReadonlyArray<string>).includes(stored)) {
      return stored as FontName;
    }
  } catch {
    /* storage blocked — fall through to the default */
  }
  return "iowan";
}

// Shipping cycle (plan T2, design §6 decision 2 REVISED): three system
// faces, Iowan -> Charter -> Georgia. Iowan is Daniel's stated preference
// (from Apple Books) and a genuine system face on both his reading devices
// (macOS + iOS); Charter and Georgia are also bundled on those platforms —
// no webfont, no font-load reflow gap (design §2, §7) for any of the three.
// Literata dropped: the only non-system face, so keeping it in the cycle
// would mean shipping a woff2 + OFL attribution and carrying the reflow gap,
// for the candidate Daniel rated lowest ("a bit too spread out").
const FONT_STACKS: Record<FontName, string> = {
  iowan: '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif',
  charter: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif',
  georgia: 'Georgia, "Nimbus Roman No9 L", serif',
};

// Toolbar display label per face (plan T2): the user is on an iPad with no
// tooltip, so the toolbar button must show the current pick as visible text.
export const FONT_LABELS: Record<FontName, string> = {
  iowan: "Iowan",
  charter: "Charter",
  georgia: "Georgia",
};

export function EpubReader({
  bookId,
  epubUrl,
  onController,
  onToc,
  onSearchState,
  onError,
  onWordActivate,
  onThemeChange,
  onFontChange,
}: EpubReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // TEMPORARY diagnostic (plan T3, remove once the iPad gesture is
  // confirmed working): direct-DOM log of raw touch events reaching the
  // content document, bypassing React state so it can't be lost to a stale
  // HMR closure. DEV-gated; visible on-device without Safari remote
  // debugging (which needs a USB/trust setup the iPad may not have).
  const touchDebugRef = useRef<HTMLPreElement>(null);
  const logTouchDebug = (line: string) => {
    if (!import.meta.env.DEV) return;
    const el = touchDebugRef.current;
    if (!el) return;
    const stamp = new Date().toISOString().slice(11, 23);
    el.textContent = `${stamp} ${line}\n${el.textContent}`.slice(0, 4000);
  };
  const callbacksRef = useRef({
    onController,
    onToc,
    onSearchState,
    onError,
    onWordActivate,
    onThemeChange,
    onFontChange,
  });
  callbacksRef.current = {
    onController,
    onToc,
    onSearchState,
    onError,
    onWordActivate,
    onThemeChange,
    onFontChange,
  };
  const bookIdRef = useRef(bookId);
  bookIdRef.current = bookId;

  // Lazy initializer (design §4): runs synchronously on first render, before
  // anything paints, so the wrapper `<div>`'s className below is already
  // correct on the very first frame — a dark preference never flashes white.
  // `themeRef` hands this same value into the imperative init() effect
  // (mirrors `bookIdRef` above) so the effect doesn't re-read localStorage.
  const [theme, setThemeState] = useState<ThemeName>(() => readStoredTheme());
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Lazy initializer, same shape as theme's (no first-paint flash concern
  // for a font — it only reaches iframe content, design §6 decision 3).
  // `fontRef` lets `setTheme` read the current font choice when it decides
  // whether to (re)inject or clear the override (see `applyFont`).
  const [font, setFontState] = useState<FontName>(() => readStoredFont());
  const fontRef = useRef(font);
  fontRef.current = font;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let destroyed = false;
    // Accessor keeps control-flow narrowing honest across awaits/closures.
    const alive = () => !destroyed;
    let book: Book | null = null;
    let rendition: Rendition | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    // Refs the controller closes over.
    const searchState: { current: SearchState } = { current: EMPTY_SEARCH };
    const activeHighlight: { cfi: string | null } = { cfi: null };
    // The reflow-preservation target: set when a search result is the last
    // navigation intent, cleared once the user navigates elsewhere.
    const resumeTarget: { cfi: string | null } = { cfi: null };
    // Small LRU of loaded section documents, keyed by href: word-transition
    // follow re-locates repeatedly within the same section, and re-loading
    // (parse + traverse) per token would be wasteful.
    const SECTION_CACHE_SIZE = 2;
    const sectionCache = new Map<string, Document>();
    // Section-level parity result (design D6), cached alongside the section
    // document itself: computed once per href, evicted together with its
    // sectionCache entry so a re-loaded section always gets a fresh check.
    const parityCache = new Map<string, SectionParityResult>();
    // Word-activate listeners (dblclick + touch double-tap, plan S4/T3) are
    // per-content-document: registered via rendition.hooks.content on every
    // section load, torn down via rendition.hooks.unloaded on that same
    // view's removal, keyed by document so a section can be
    // loaded/unloaded/reloaded repeatedly without leaking listeners.
    const wordActivateCleanup = new Map<Document, () => void>();
    // All follow/locate-driven displays go through ONE latest-wins scheduler:
    // overlapping rendition.display() calls wedge epub.js's internal queue
    // (observed: locate promises that never settle while follow fires 2-3
    // locates/sec, reader frozen). At most one display in flight; queued
    // displays collapse to the newest; a wedged display self-heals on
    // timeout. User-paced navigation (prev/next/goTo/gotoResult/search) is
    // rare and stays direct.
    const displayScheduler = createLatestWins<string>((cfi) =>
      rendition ? rendition.display(cfi) : Promise.resolve(),
    );
    // Shared by theme switches and the dev-only font cycle (design §6
    // decision 6): `themes.select`/`themes.font` inject CSS into already-
    // rendered content but never repaginate — a theme/font change alone can
    // clip text or (for a webfont) never even notice the swap, since epub.js's
    // font-load-listener repagination hook is commented out upstream (design
    // §2). Redisplaying the current position through the existing
    // latest-wins scheduler fixes both, and keeps the reading position (no
    // scroll-to-top surprise) — same mechanism already used to re-show
    // `resumeTarget.cfi` after a container resize, below.
    const redisplayCurrentPosition = () => {
      if (!rendition) return;
      try {
        const location = rendition.currentLocation() as unknown as
          { start?: { cfi?: string } } | undefined;
        const cfi = location?.start?.cfi;
        if (!cfi) return;
        void displayScheduler(cfi).catch(() => {
          /* display is best-effort here; the theme/font change already applied */
        });
      } catch {
        /* currentLocation can throw early in the lifecycle; nothing to redisplay */
      }
    };
    // Keeps book-default honest (plan T2, `ReaderController.setFont` doc
    // above): `themes.font()` is `themes.override("font-family", ..., true)`
    // — override state is global, independent of `themes.select`, and
    // re-applied to every future content load regardless of which theme is
    // current (themes.js:22,145-150,232-240). So the font is only ever
    // handed to `themes.font()` while `light`/`dark` is selected; switching
    // TO `default` actively clears the standing override instead of leaving
    // it to leak through. `removeOverride` exists at runtime (themes.js:218)
    // but isn't in epubjs's .d.ts, hence the cast.
    const applyFont = (themeName: ThemeName, fontName: FontName) => {
      if (!rendition) return;
      if (themeName === "default") {
        (
          rendition.themes as unknown as {
            removeOverride: (name: string) => void;
          }
        ).removeOverride("font-family");
      } else {
        rendition.themes.font(FONT_STACKS[fontName]);
      }
    };
    const cacheSection = (href: string, document: Document) => {
      sectionCache.delete(href);
      sectionCache.set(href, document);
      if (sectionCache.size > SECTION_CACHE_SIZE) {
        const oldest = sectionCache.keys().next().value;
        if (oldest !== undefined) {
          sectionCache.delete(oldest);
          parityCache.delete(oldest);
        }
      }
    };

    // DETACHED section load, shared by locate and the dblclick bridge:
    // fetch + parse the section content WITHOUT mutating the shared Section
    // object. section.load() sets section.document/contents and fires
    // content hooks on the SAME Section instance rendition.display() loads
    // internally; that contention wedges epub.js's display queue (observed:
    // locate loads a section, a follow display of that section tears down
    // the old view and hangs forever, poisoning every later display).
    // book.load(section.url) goes straight to the archive/request layer and
    // leaves the Section untouched. Results cache in the sectionCache LRU,
    // keyed by section.href.
    type DetachedSectionLoad =
      | { ok: true; document: Document }
      | {
          ok: false;
          reason:
            | "reader-not-ready"
            | "section-load-failed"
            | "section-document-missing";
          error?: unknown;
        };
    const loadDetachedSection = async (
      section: SpineItemLike,
    ): Promise<DetachedSectionLoad> => {
      const cached = sectionCache.get(section.href);
      if (cached) return { ok: true, document: cached };
      if (!book) return { ok: false, reason: "reader-not-ready" };
      let response: unknown;
      try {
        response = await book.load(section.url);
      } catch (error) {
        return { ok: false, reason: "section-load-failed", error };
      }
      if (!alive()) return { ok: false, reason: "reader-not-ready" };
      const document = documentFromSectionResponse(response, section.href);
      if (!document) {
        return { ok: false, reason: "section-document-missing" };
      }
      cacheSection(section.href, document);
      return { ok: true, document };
    };

    const pushSearch = (next: SearchState) => {
      searchState.current = next;
      callbacksRef.current.onSearchState(next);
    };

    const removeHighlight = () => {
      if (!rendition || !activeHighlight.cfi) return;
      try {
        rendition.annotations.remove(activeHighlight.cfi, "highlight");
      } catch {
        /* annotation may already be gone */
      }
      activeHighlight.cfi = null;
    };

    const gotoResult = (index: number) => {
      const result = searchState.current.results[index];
      if (!rendition || !result) return;
      removeHighlight();
      resumeTarget.cfi = result.cfi;
      void rendition.display(result.cfi).then(() => {
        if (!alive() || !rendition) return;
        try {
          rendition.annotations.highlight(
            result.cfi,
            {},
            undefined,
            "bp-search-hl",
            { fill: "rgba(14,116,144,0.35)", "fill-opacity": "0.6" },
          );
          activeHighlight.cfi = result.cfi;
        } catch {
          /* highlight is best-effort; navigation already happened */
        }
      });
      pushSearch({ ...searchState.current, activeIndex: index });
    };

    const init = async () => {
      try {
        const { default: ePub, EpubCFI } = await import("epubjs");
        if (!alive()) return;

        // Visible fast path for locate: is `cfi` already within the
        // displayed [start, end] range? EpubCFI.compare treats a range CFI
        // as its start point, which is exactly the containment we want (a
        // token whose start is on-screen is on-screen). Defensive: early in
        // the lifecycle currentLocation() can be undefined/empty or a
        // pending promise — every unknown answers "not visible" so the
        // caller just displays normally.
        const isCfiDisplayed = (cfi: string): boolean => {
          if (!rendition) return false;
          try {
            const location = rendition.currentLocation() as unknown as
              { start?: { cfi?: string }; end?: { cfi?: string } } | undefined;
            const startCfi = location?.start?.cfi;
            const endCfi = location?.end?.cfi;
            if (!startCfi || !endCfi) return false;
            const comparator = new EpubCFI();
            return (
              comparator.compare(cfi, startCfi) >= 0 &&
              comparator.compare(cfi, endCfi) <= 0
            );
          } catch {
            return false;
          }
        };

        book = ePub(epubUrl, { openAs: "epub" });
        rendition = book.renderTo(container, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "auto",
        });

        // Three-state theme model (plan T1, design §6 decision 1): `default`
        // has NO rules — book CSS fully governs, replacing the old always-on
        // forced slate/cyan. `light` is that old forced palette (proven
        // legible), `dark` is a new inverted palette matching the app
        // chrome's own bg-slate-900 (design §7). `register`, not `override`,
        // so `default` genuinely injects zero CSS. `select` (below) swaps
        // between them; only `select` changes what's on the page, so book
        // default stays byte-for-byte the book's own stylesheet.
        // Selectors are CLASS-SCOPED (`body.light`, `body.dark`), and that is
        // load-bearing, not cosmetic. epub.js `themes.select()` only ADDS the
        // new theme's rules — `add()` writes into a per-key <style> node
        // (`contents._getStylesheetNode`) that is never removed, so the
        // previous theme's CSS stays in the document forever. With unscoped
        // `body {}` selectors, dark's `background` survived a switch to light
        // (which sets no background) and to default (which sets nothing at
        // all), so the page stayed dark until a fresh section load happened to
        // inject only the current theme. What makes switching work is the
        // class `select()` toggles on body (`removeClass(prev)`/
        // `addClass(name)`) — scoping to it renders the stale stylesheets
        // inert. `default` keeps zero rules and gets no class, so book default
        // stays genuinely un-injected.
        //
        // `light` therefore states its background explicitly rather than
        // relying on the book's own: it must be able to win against whatever
        // the book sets, exactly as `dark` does.
        rendition.themes.register({
          default: {},
          light: {
            "body.light": {
              background: "#ffffff !important",
              color: "#1e293b !important",
            },
            "body.light a, body.light a:link, body.light a:visited": {
              color: "#0e7490 !important",
            },
          },
          dark: {
            "body.dark": {
              background: "#0f172a !important",
              color: "#e2e8f0 !important",
            },
            "body.dark a, body.dark a:link, body.dark a:visited": {
              color: "#22d3ee !important",
            },
          },
        });
        // Font-family is intentionally NOT part of these rule objects: it's
        // applied separately below via `applyFont`, as a `themes.font()`
        // override gated on the current theme (see the doc on
        // `ReaderController.setFont`) — that's the only way to keep
        // `default` genuinely un-injected while still letting the font cycle
        // independently of the theme cycle.
        //
        // themeRef/fontRef, not a fresh localStorage read (design §4): the
        // lazy `useState` initializers already read them once,
        // synchronously, before first paint — re-reading here would risk
        // racing a `setTheme`/`setFont` call that landed between mount and
        // this async init() resuming.
        rendition.themes.select(themeRef.current);
        applyFont(themeRef.current, fontRef.current);
        callbacksRef.current.onThemeChange?.(themeRef.current);
        callbacksRef.current.onFontChange?.(fontRef.current);

        rendition.on("relocated", (location: { start: { cfi: string } }) => {
          try {
            localStorage.setItem(cfiKey(bookIdRef.current), location.start.cfi);
          } catch {
            /* storage full/blocked — resume just won't work */
          }
        });

        // Reverse-sync gesture (plan S4, touch added T3): dblclick natively
        // selects the clicked word in the iframe content document; touch has
        // no `dblclick` at all (CONFIRMED dead on iPad, Daniel 2026-08-18 —
        // double-tap did nothing), so a same-shape double-tap detector runs
        // alongside it below. `hooks.content` fires once per section content
        // load with the Contents instance for that section; `hooks.unloaded`
        // fires once per view removal — used here only to remove the
        // listeners this content hook added, keyed by document so repeated
        // load/unload of the same section never leaks.
        rendition.hooks.content.register((contents: Contents) => {
          // Hazard 2 (plan T3): Safari's double-tap-to-zoom competes for
          // this exact gesture. `touch-action: manipulation` on the content
          // document's root disables JUST the double-tap-to-zoom heuristic
          // (pan and pinch-zoom stay live) — the standard fix, and simpler/
          // more reliable than viewport-meta tricks (`user-scalable=no` is
          // widely ignored by modern Safari for accessibility). Applied
          // unconditionally, not gated by theme: it's a gesture fix, not a
          // reading-surface preference. Residual risk: touch-action doesn't
          // inherit through a descendant that sets its OWN more permissive
          // value, so if a book's CSS explicitly overrides touch-action on
          // some element, double-tap-zoom could still fire there — the
          // `preventDefault` on the detected second tap below is the
          // belt-and-suspenders backstop for that case.
          contents.document.documentElement.style.touchAction = "manipulation";
          contents.document.body.style.touchAction = "manipulation";

          // Shared by both gesture paths: resolve a DOM point (already
          // computed by either resolveDblClickPoint call site below) to a
          // WordActivatePoint via the CFI bridge and report it.
          const activatePoint = (
            point: { node: Node; offset: number } | null,
          ) => {
            const activateWord = callbacksRef.current.onWordActivate;
            if (!activateWord || !book || !point) {
              logTouchDebug(
                `activatePoint bailed: activateWord=${!!activateWord} book=${!!book} point=${!!point}`,
              );
              return;
            }
            // spineItems (below), not book.spine.get: its type honestly
            // reflects that an out-of-range sectionIndex has no entry.
            const section = spineItems(book)[contents.sectionIndex];
            if (!section) {
              logTouchDebug(
                "activatePoint bailed: no section for sectionIndex",
              );
              return;
            }
            // CFI bridge (see WordActivatePoint): the rendered view is an
            // about:srcdoc iframe, ALWAYS HTML-parsed — even a .xhtml
            // section gets the HTML parser's whitespace handling (e.g. the
            // text node before <head> is dropped), so childNodes paths
            // computed against this document can never match the capture
            // parse's segPaths (systematic node-not-located). CFIs are how
            // epub.js itself crosses that divergence for forward highlights
            // (element-only even steps + merged text chunks are
            // whitespace-tolerant), so run the same bridge in reverse:
            // rendered click point -> CFI -> range in the DETACHED
            // capture-parse document -> capture-side node/offset.
            void (async () => {
              let bridged: { node: Node; offset: number } | null = null;
              try {
                const clickRange = contents.document.createRange();
                clickRange.setStart(point.node, point.offset);
                clickRange.collapse(true);
                const cfi = section.cfiFromRange(clickRange);
                const detached = await loadDetachedSection(section);
                if (detached.ok) {
                  // The .d.ts says toRange always returns a Range; the
                  // runtime hands back undefined when it can't resolve —
                  // same guard as the locate sweep.
                  const target = new EpubCFI(cfi).toRange(detached.document) as
                    Range | null | undefined;
                  if (target) {
                    bridged = {
                      node: target.startContainer,
                      offset: target.startOffset,
                    };
                  }
                }
              } catch {
                /* bridge is best-effort; fall through to the rendered point */
              }
              if (!alive()) return;
              // Fallback on any bridge failure: deliver the RENDERED-doc
              // point — downstream fails node-not-located and the route's
              // notice still gives feedback (no silent dead clicks).
              logTouchDebug(
                `activateWord() called, bridged=${!!bridged}, sectionHref=${section.href}`,
              );
              activateWord({
                sectionHref: section.href,
                node: bridged?.node ?? point.node,
                offset: bridged?.offset ?? point.offset,
              });
            })();
          };

          // Hybrid-device guard: a touch-capable laptop can synthesize a
          // `dblclick` from the same physical gesture the touch handler
          // below already acted on. Set right before acting on a detected
          // double-tap, cleared either by the next `dblclick` (consuming
          // it) or by the timeout (so a stale flag can never suppress a
          // LATER, genuine mouse dblclick).
          let suppressNextDblClick = false;
          let suppressTimer: ReturnType<typeof setTimeout> | null = null;
          const armDblClickSuppression = () => {
            suppressNextDblClick = true;
            if (suppressTimer) clearTimeout(suppressTimer);
            suppressTimer = setTimeout(() => {
              suppressNextDblClick = false;
            }, 500);
          };

          const handleDblClick = (event: MouseEvent) => {
            if (suppressNextDblClick) {
              suppressNextDblClick = false;
              if (suppressTimer) clearTimeout(suppressTimer);
              return;
            }
            activatePoint(
              resolveDblClickPoint(
                contents.window,
                event.clientX,
                event.clientY,
              ),
            );
          };
          contents.document.addEventListener("dblclick", handleDblClick);

          // Touch double-tap (plan T3): touch delivers no `dblclick`, so
          // detect the gesture by hand from raw touch events and feed the
          // resolved tap point through the SAME `resolveDblClickPoint` ->
          // `activatePoint` path `dblclick` uses above — no parallel
          // coordinate-resolution or CFI-bridging logic.
          let touchStart: { x: number; y: number } | null = null;
          let lastTap: { time: number; x: number; y: number } | null = null;
          const handleTouchStart = (event: TouchEvent) => {
            // Only a single, stationary touch counts toward a tap — a
            // second simultaneous touch is a pinch, not part of a double-
            // tap sequence.
            const touch = event.touches.item(0);
            touchStart =
              event.touches.length === 1 && touch
                ? { x: touch.clientX, y: touch.clientY }
                : null;
            logTouchDebug(
              `touchstart n=${event.touches.length} ${touchStart ? `(${Math.round(touchStart.x)},${Math.round(touchStart.y)})` : "ignored"}`,
            );
          };
          const handleTouchEnd = (event: TouchEvent) => {
            const start = touchStart;
            touchStart = null;
            const end = event.changedTouches.item(0);
            if (event.changedTouches.length !== 1 || !end) {
              logTouchDebug(
                `touchend REJECTED changedTouches.length=${event.changedTouches.length}`,
              );
              lastTap = null;
              return;
            }
            // A tap that MOVED is a swipe/page-turn or a scroll (epub.js
            // paginated flow uses swipes), never a word activation — reset
            // rather than let it count as either tap of a double-tap.
            const moved = start
              ? tapDistance(start.x, start.y, end.clientX, end.clientY)
              : null;
            if (!start || (moved !== null && moved > TAP_MOVE_PX)) {
              logTouchDebug(
                `touchend REJECTED moved=${moved === null ? "no-start" : moved.toFixed(1)}px (limit ${TAP_MOVE_PX})`,
              );
              lastTap = null;
              return;
            }
            const now = Date.now();
            const prev = lastTap;
            const gapMs = prev ? now - prev.time : null;
            const gapPx = prev
              ? tapDistance(prev.x, prev.y, end.clientX, end.clientY)
              : null;
            const isDoubleTap =
              prev !== null &&
              gapMs !== null &&
              gapMs <= DOUBLE_TAP_MS &&
              gapPx !== null &&
              gapPx <= TAP_MOVE_PX;
            logTouchDebug(
              `touchend (${Math.round(end.clientX)},${Math.round(end.clientY)}) moved=${moved?.toFixed(1)}px prevTap=${prev ? `${gapMs}ms/${gapPx?.toFixed(1)}px` : "none"} -> ${isDoubleTap ? "DOUBLE-TAP FIRING" : "single, armed"}`,
            );
            if (isDoubleTap) {
              lastTap = null;
              // preventDefault on the second tap's touchend is the primary
              // cancel for Safari's pending double-tap-to-zoom (hazard 2)
              // on any element the `touch-action` rule above didn't reach.
              event.preventDefault();
              armDblClickSuppression();
              const point = resolveDblClickPoint(
                contents.window,
                end.clientX,
                end.clientY,
              );
              logTouchDebug(
                point
                  ? `resolved point ok, offset=${point.offset}`
                  : "resolveDblClickPoint returned null — nothing to activate",
              );
              activatePoint(point);
            } else {
              lastTap = { time: now, x: end.clientX, y: end.clientY };
            }
          };
          // touchend must be non-passive: the double-tap branch above calls
          // preventDefault to cancel Safari's zoom.
          contents.document.addEventListener("touchstart", handleTouchStart, {
            passive: true,
          });
          contents.document.addEventListener("touchend", handleTouchEnd, {
            passive: false,
          });

          wordActivateCleanup.set(contents.document, () => {
            contents.document.removeEventListener("dblclick", handleDblClick);
            contents.document.removeEventListener(
              "touchstart",
              handleTouchStart,
            );
            contents.document.removeEventListener("touchend", handleTouchEnd);
            if (suppressTimer) clearTimeout(suppressTimer);
          });
        });
        rendition.hooks.unloaded.register((view: { contents?: Contents }) => {
          const doc = view.contents?.document;
          if (!doc) return;
          const cleanup = wordActivateCleanup.get(doc);
          if (cleanup) {
            cleanup();
            wordActivateCleanup.delete(doc);
          }
        });

        // Spine items exist only after the book is fully opened.
        await book.ready;
        if (!alive()) return;

        // Nothing user-critical may await a display from here on: an epub.js
        // display() can wedge (never settle — the same failure class the
        // latest-wins scheduler exists for), and the initial display used to
        // sit between book.ready and onToc/onController/ResizeObserver,
        // leaving the controller null forever when it wedged. Deliver all of
        // those first; the initial position is scheduled non-blocking below.
        // NB: book.ready's Promise.all already includes loaded.navigation,
        // so this await is an already-settled promise, not a real wait.
        const nav = await book.loaded.navigation;
        callbacksRef.current.onToc(
          nav.toc.map((item: NavItem) => ({
            label: item.label.trim(),
            href: item.href,
          })),
        );

        // Re-display the search target after container resizes settle, so a
        // reflow cannot lose the match the user just navigated to. Routed
        // through the same latest-wins scheduler as locate's display, so a
        // resize re-display can never overlap (and wedge) a follow display.
        resizeObserver = new ResizeObserver(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (!alive() || !rendition || !resumeTarget.cfi) return;
            void displayScheduler(resumeTarget.cfi).catch(() => {
              /* display is best-effort here; a locate owns error reporting */
            });
          }, 150);
        });
        resizeObserver.observe(container);

        callbacksRef.current.onController({
          prev: () => {
            resumeTarget.cfi = null;
            void rendition?.prev();
          },
          next: () => {
            resumeTarget.cfi = null;
            void rendition?.next();
          },
          goTo: (href) => {
            resumeTarget.cfi = null;
            void rendition?.display(href);
          },
          clearSearch: () => {
            removeHighlight();
            resumeTarget.cfi = null;
            pushSearch(EMPTY_SEARCH);
          },
          gotoResult,
          locate: async (locator) => {
            const fail = (
              reason: Extract<LocateResult, { ok: false }>["reason"],
              details?: unknown,
              options?: { warn?: boolean },
            ): LocateResult => {
              const result: LocateResult = {
                ok: false,
                reason,
                locator,
                details,
              };
              if (options?.warn ?? true) {
                console.warn("[EPUB locate failed]", result);
              }
              return result;
            };

            if (!book || !rendition) return fail("reader-not-ready");
            // Extraction hrefs and epub.js spine hrefs can differ by a base
            // dir prefix; match on either suffix.
            const section = spineItems(book).find(
              (item) =>
                item.href.endsWith(locator.spineHref) ||
                locator.spineHref.endsWith(item.href),
            );
            if (!section) {
              return fail("section-not-found", {
                requestedSpineHref: locator.spineHref,
                spineHrefs: spineItems(book).map((item) => item.href),
              });
            }

            // Detached load (never mutates shared Section state — see
            // loadDetachedSection above); LRU-cached by href.
            const loaded = await loadDetachedSection(section);
            if (!loaded.ok) {
              return fail(loaded.reason, {
                sectionHref: section.href,
                error: loaded.error,
              });
            }
            const { document } = loaded;

            // Section parity gate (design D6): validate the whole segment
            // table once per section href before trusting any token locate in
            // it. Cached alongside the section document — a cache hit here
            // (including a cached failure) means this section was already
            // checked, so a failure warns only the first time it's computed.
            let parity = parityCache.get(section.href);
            let parityJustComputed = false;
            if (!parity) {
              parity = checkSectionParity(
                document,
                locator.segPaths,
                locator.segTextLen,
              );
              parityCache.set(section.href, parity);
              parityJustComputed = true;
            }
            if (!parity.ok) {
              return fail(
                "section-parity-failed",
                { sectionHref: section.href, parity },
                { warn: parityJustComputed },
              );
            }

            const rangeResult = diagnoseRangeFromDomPath(
              document,
              locator.segPaths,
              locator.loc,
            );
            // Parity guard (plan D7/P2): the browser-parsed section DOM must
            // match the server's extraction-time jsdom parse structurally. A
            // mismatch means the captured path no longer lands on the same
            // text — skip the highlight rather than risk a wrong one.
            if (!rangeResult.ok) {
              return fail("range-path-failed", {
                sectionHref: section.href,
                failure: rangeResult.failure,
              });
            }
            const { range } = rangeResult;

            const resolvedText = normalizeText(range.toString()).text;
            const expectedText = normalizeText(locator.expectedRaw).text;
            if (resolvedText !== expectedText) {
              return fail("text-mismatch", {
                sectionHref: section.href,
                expectedText,
                resolvedText,
              });
            }

            let cfi: string;
            try {
              // Pure and detached-safe: section.cfiFromRange is
              // `new EpubCFI(range, this.cfiBase).toString()` (section.js) —
              // it reads only the constant cfiBase and walks the range's
              // OWN document, so a range from our detached document is
              // fine; the locate sweep generates CFIs the same way.
              cfi = section.cfiFromRange(range);
            } catch (error) {
              return fail("cfi-generation-failed", {
                sectionHref: section.href,
                error,
              });
            }
            if (!alive()) return fail("reader-not-ready");
            removeHighlight();
            resumeTarget.cfi = cfi;
            // Visible fast path: word-to-word follow usually stays on the
            // page already displayed — skip display entirely and just move
            // the highlight, avoiding repagination churn. Otherwise route
            // the display through the latest-wins scheduler (never two
            // displays in flight — overlapping calls wedge epub.js).
            if (!isCfiDisplayed(cfi)) {
              const outcome = await displayScheduler(cfi);
              if (outcome === "superseded") {
                // A newer locate replaced this one before it displayed: the
                // newer locate owns the screen AND the highlight. Not a
                // failure — this token was simply overtaken by follow.
                return { ok: true, cfi };
              }
            }

            if (!alive()) return fail("reader-not-ready");
            try {
              rendition.annotations.highlight(
                cfi,
                {},
                undefined,
                "bp-align-hl",
                { fill: "rgba(14,116,144,0.35)", "fill-opacity": "0.6" },
              );
              activeHighlight.cfi = cfi;
            } catch {
              /* highlight is best-effort; navigation already happened */
            }
            return { ok: true, cfi };
          },
          search: async (query) => {
            const trimmed = query.trim();
            if (!book || trimmed.length === 0) return;
            pushSearch({
              query: trimmed,
              searching: true,
              results: [],
              activeIndex: null,
            });
            const results = await searchSpine(book, trimmed);
            if (!alive()) return;
            pushSearch({
              query: trimmed,
              searching: false,
              results,
              activeIndex: null,
            });
          },
          setTheme: (name) => {
            if (!rendition) return;
            rendition.themes.select(name);
            // Re-apply (or clear) the standing font override for the NEW
            // theme — a font choice made under `light` must not silently
            // persist once the user cycles to `default` (see `applyFont`).
            applyFont(name, fontRef.current);
            setThemeState(name);
            try {
              localStorage.setItem(themeKey(), name);
            } catch {
              /* storage full/blocked — preference just won't persist */
            }
            callbacksRef.current.onThemeChange?.(name);
            redisplayCurrentPosition();
          },
          setFont: (name) => {
            if (!rendition) return;
            // Gated the same way as the theme-change path above: under
            // `default` this clears the override rather than injecting the
            // new font, so book-default stays honest even while the
            // preference itself is recorded for when the user next picks
            // `light`/`dark`.
            applyFont(themeRef.current, name);
            setFontState(name);
            try {
              localStorage.setItem(fontKey(), name);
            } catch {
              /* storage full/blocked — preference just won't persist */
            }
            callbacksRef.current.onFontChange?.(name);
            redisplayCurrentPosition();
          },
        });

        // Initial position, NON-BLOCKING, through the same latest-wins
        // scheduler as locate/resize displays (display() accepts hrefs as
        // well as CFIs), so an init display can never overlap an early
        // follow locate — and a wedged one costs its timeout, not a
        // deadlock. First open: saved location, else the first readable
        // (non-cover) spine item so text, not cover art, is the default
        // surface.
        const savedCfi = localStorage.getItem(cfiKey(bookIdRef.current));
        const initialTarget = savedCfi ?? firstReadableHref(book);
        if (initialTarget) {
          void displayScheduler(initialTarget)
            .then((outcome) => {
              // "superseded": an early follow locate already took the
              // screen — it owns the position; no cover-advance either.
              if (outcome === "superseded") return;
              // Cover pages hide behind generic hrefs too: if the first
              // view has almost no text (image-only page), advance once so
              // first open shows readable content. Direct call is fine —
              // single and rare, and only when nothing superseded us.
              // visibleTextLength is null when NO view rendered at all —
              // e.g. this "done" was a timeout self-heal, where next()
              // would throw synchronously on the unstarted manager — so
              // only a genuinely rendered near-empty page advances.
              if (!savedCfi && alive() && rendition) {
                const textLength = visibleTextLength(rendition);
                if (textLength !== null && textLength < 200) {
                  void rendition.next();
                }
              }
            })
            .catch((error: unknown) => {
              console.warn("[reader] initial display failed", error);
            });
        } else {
          // No saved position and no readable spine href to aim at: let
          // epub.js pick its default start (still non-blocking).
          void rendition.display();
        }
      } catch (error) {
        if (alive()) {
          callbacksRef.current.onError(
            error instanceof Error ? error.message : "Failed to load EPUB",
          );
        }
      }
    };

    void init();

    return () => {
      destroyed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      callbacksRef.current.onController(null);
      callbacksRef.current.onSearchState(EMPTY_SEARCH);
      try {
        book?.destroy();
      } catch {
        /* already torn down */
      }
    };
    // Lifecycle keyed to the asset identity only (experiment lesson).
  }, [epubUrl]);

  // Outer clipping only, plus the wrapper background (design §4): epub.js
  // themes only reach the content iframe, never this element, so `dark`
  // needs its own class here or a themed page would float inside a
  // permanently white frame. `default`/`light` both keep today's `bg-white`
  // — only `dark` needs a different wrapper color (design §6 decision 1).
  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className={`h-full w-full overflow-hidden ${
          theme === "dark" ? "bg-slate-900" : "bg-white"
        }`}
        data-testid="epub-reader"
      />
      {/* TEMPORARY diagnostic (plan T3, see touchDebugRef/logTouchDebug
          above): on-device visibility into raw touch events reaching the
          content document, since the iPad can't easily get Safari remote
          debugging. Remove once the double-tap gesture is confirmed working
          on-device. */}
      {import.meta.env.DEV && (
        <pre
          ref={touchDebugRef}
          data-testid="touch-debug"
          className="pointer-events-none absolute bottom-0 left-0 z-50 max-h-40 w-full overflow-hidden whitespace-pre-wrap bg-black/80 p-1 text-[9px] leading-tight text-lime-300"
        />
      )}
    </div>
  );
}

// epubjs's Spine type hides its sections; the runtime shape is stable.
// NB: spine.items are manifest entries — only spine.spineItems are Section
// objects with load/find/unload.
interface SpineItemLike {
  href: string;
  /** Resolved asset URL (section.js sets it from the spine item) — what
   * book.load() takes for a detached content fetch. */
  url: string;
  linear: boolean;
  load: (loader: unknown) => Promise<unknown>;
  unload: () => void;
  find: (query: string) => Array<{ cfi: string; excerpt: string }>;
  /** Populated between load() and unload(). */
  document?: Document;
  cfiFromRange: (range: Range) => string;
}

function spineItems(book: Book): Array<SpineItemLike> {
  return (book.spine as unknown as { spineItems: Array<SpineItemLike> })
    .spineItems;
}

/**
 * Coerce a book.load() response into a Document, for locate's detached
 * section loads. For archived (zip) books — this app always opens
 * `openAs: "epub"` — epub.js 0.3.93 parses content by FILE EXTENSION before
 * returning (archive.js handleResponse: "xhtml" -> application/xhtml+xml,
 * "html"/"htm" -> text/html, xml/opf/ncx -> text/xml; the HTTP request
 * path in utils/request.js applies the same rule), so a content document
 * normally arrives already parsed. Only an unrecognized extension falls
 * through as a raw string — parsed here with the same extension rule
 * (defaulting to XHTML, the EPUB content-document type). Null when the
 * response is neither.
 */
function documentFromSectionResponse(
  response: unknown,
  href: string,
): Document | null {
  if (
    typeof response === "object" &&
    response !== null &&
    (response as Node).nodeType === 9 /* Node.DOCUMENT_NODE */
  ) {
    return response as Document;
  }
  if (typeof response === "string") {
    const extension = href.split(".").pop()?.toLowerCase();
    const mimeType =
      extension === "html" || extension === "htm"
        ? "text/html"
        : "application/xhtml+xml";
    try {
      return new DOMParser().parseFromString(response, mimeType);
    } catch {
      return null;
    }
  }
  return null;
}

function firstReadableHref(book: Book): string | null {
  for (const item of spineItems(book)) {
    if (item.linear && !/cover/i.test(item.href)) return item.href;
  }
  return null;
}

/** Text length across the rendered views; null when nothing is rendered (or
 * the manager isn't inspectable) — callers must not treat that as "empty
 * page": an unrendered rendition (e.g. a display that wedged and was
 * self-healed by the scheduler) has no page to advance past, and epub.js
 * next() throws synchronously on its unstarted manager. */
function visibleTextLength(rendition: Rendition): number | null {
  try {
    const contents = (
      rendition as unknown as {
        getContents: () => Array<{ document?: Document }>;
      }
    ).getContents();
    if (contents.length === 0) return null;
    return contents.reduce((sum, c) => {
      const text = c.document?.body.textContent ?? "";
      return sum + text.trim().length;
    }, 0);
  } catch {
    return null; // unknown: don't skip anything
  }
}

/** Spine-wide search: load/find/unload per section, capped and deduped.
 * NB: item.load/unload MUTATE shared Section state — the same contention
 * class that wedged rendition.display when locate did it (locate now loads
 * detached via book.load). Tolerated here because search is user-paced and
 * rare; if search ever runs concurrently with displays, give it the same
 * detached treatment. */
async function searchSpine(
  book: Book,
  query: string,
): Promise<Array<SearchResult>> {
  const results: Array<SearchResult> = [];
  const seen = new Set<string>();
  for (const item of spineItems(book)) {
    if (results.length >= MAX_RESULTS) break;
    try {
      await item.load(book.load.bind(book));
      for (const found of item.find(query)) {
        if (results.length >= MAX_RESULTS) break;
        if (typeof found.cfi !== "string" || seen.has(found.cfi)) continue;
        seen.add(found.cfi);
        results.push({ cfi: found.cfi, excerpt: found.excerpt || query });
      }
    } catch {
      /* malformed section: skip, keep searching */
    } finally {
      try {
        item.unload();
      } catch {
        /* ignore unload noise */
      }
    }
  }
  return results;
}
