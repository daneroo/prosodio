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
import { useEffect, useRef } from "react";

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
}

export const EMPTY_SEARCH: SearchState = {
  query: "",
  searching: false,
  results: [],
  activeIndex: null,
};

/** A raw DOM point reported by a double-click in the reader (plan
 * player-sync-core S4): the section's epub.js href plus the resolved
 * text-node/offset. Deliberately artifact-agnostic — EpubReader knows
 * nothing about spines/tokens; the route maps this to a seek target via
 * `seekTargetForBookPoint` (player-sync.ts), same division of labor as
 * `locate`. */
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
}

/**
 * Resolve the DOM point a dblclick landed on, inside one section's content
 * window (plan S4): dblclick natively selects the clicked word, so prefer
 * the selection's start point; fall back to `caretRangeFromPoint` for
 * browsers/cases where the selection didn't land on a text node (e.g. the
 * click missed text). Null means there's nothing resolvable to report.
 */
function resolveDblClickPoint(
  win: Window,
  event: MouseEvent,
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
    const range = doc.caretRangeFromPoint(event.clientX, event.clientY);
    if (
      range &&
      range.startContainer.nodeType === range.startContainer.TEXT_NODE
    ) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

const MAX_RESULTS = 100;

function cfiKey(bookId: string): string {
  return `bookplayer:${bookId}:cfi`;
}

export function EpubReader({
  bookId,
  epubUrl,
  onController,
  onToc,
  onSearchState,
  onError,
  onWordActivate,
}: EpubReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({
    onController,
    onToc,
    onSearchState,
    onError,
    onWordActivate,
  });
  callbacksRef.current = {
    onController,
    onToc,
    onSearchState,
    onError,
    onWordActivate,
  };
  const bookIdRef = useRef(bookId);
  bookIdRef.current = bookId;

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
    // dblclick listeners are per-content-document (plan S4): registered via
    // rendition.hooks.content on every section load, torn down via
    // rendition.hooks.unloaded on that same view's removal, keyed by
    // document so a section can be loaded/unloaded/reloaded repeatedly
    // without leaking listeners.
    const dblClickCleanup = new Map<Document, () => void>();
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

        // High-contrast reading surface on the dark shell.
        rendition.themes.default({
          body: { color: "#1e293b !important" },
          "a, a:link, a:visited": { color: "#0e7490 !important" },
        });

        rendition.on("relocated", (location: { start: { cfi: string } }) => {
          try {
            localStorage.setItem(cfiKey(bookIdRef.current), location.start.cfi);
          } catch {
            /* storage full/blocked — resume just won't work */
          }
        });

        // Reverse-sync gesture (plan S4): dblclick natively selects the
        // clicked word in the iframe content document. `hooks.content` fires
        // once per section content load with the Contents instance for that
        // section; `hooks.unloaded` fires once per view removal — used here
        // only to remove the listener this content hook added, keyed by
        // document so repeated load/unload of the same section never leaks.
        rendition.hooks.content.register((contents: Contents) => {
          const handleDblClick = (event: MouseEvent) => {
            const activateWord = callbacksRef.current.onWordActivate;
            if (!activateWord || !book) return;
            const point = resolveDblClickPoint(contents.window, event);
            if (!point) return;
            // spineItems (below), not book.spine.get: its type honestly
            // reflects that an out-of-range sectionIndex has no entry.
            const sectionHref = spineItems(book)[contents.sectionIndex]?.href;
            if (!sectionHref) return;
            activateWord({
              sectionHref,
              node: point.node,
              offset: point.offset,
            });
          };
          contents.document.addEventListener("dblclick", handleDblClick);
          dblClickCleanup.set(contents.document, () => {
            contents.document.removeEventListener("dblclick", handleDblClick);
          });
        });
        rendition.hooks.unloaded.register((view: { contents?: Contents }) => {
          const doc = view.contents?.document;
          if (!doc) return;
          const cleanup = dblClickCleanup.get(doc);
          if (cleanup) {
            cleanup();
            dblClickCleanup.delete(doc);
          }
        });

        // Spine items exist only after the book is fully opened.
        console.debug("[reader] awaiting book.ready");
        await book.ready;
        if (!alive()) return;
        console.debug("[reader] book ready");

        // Nothing user-critical may await a display from here on: an epub.js
        // display() can wedge (never settle — the same failure class the
        // latest-wins scheduler exists for), and the initial display used to
        // sit between book.ready and onToc/onController/ResizeObserver,
        // leaving the controller null forever when it wedged. Deliver all of
        // those first; the initial position is scheduled non-blocking below.
        // NB: book.ready's Promise.all already includes loaded.navigation,
        // so this await is an already-settled promise, not a real wait.
        const nav = await book.loaded.navigation;
        console.debug("[reader] nav loaded");
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

            let document = sectionCache.get(section.href);
            if (!document) {
              // DETACHED load — locate must never mutate shared Section
              // state. section.load() sets section.document/contents and
              // fires content hooks on the SAME Section instance that
              // rendition.display() loads internally; that contention
              // wedges epub.js's display queue (observed: locate loads a
              // section, a follow display of that section tears down the
              // old view and hangs forever, poisoning every later
              // display). book.load(section.url) goes straight to the
              // archive/request layer and leaves the Section untouched.
              let response: unknown;
              try {
                response = await book.load(section.url);
              } catch (error) {
                return fail("section-load-failed", {
                  sectionHref: section.href,
                  error,
                });
              }
              if (!alive()) return fail("reader-not-ready");
              document =
                documentFromSectionResponse(response, section.href) ??
                undefined;
              if (!document) {
                return fail("section-document-missing", {
                  sectionHref: section.href,
                });
              }
              cacheSection(section.href, document);
            }

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
        });
        console.debug("[reader] controller delivered");

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
              console.debug(`[reader] initial display ${outcome}`);
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
                  console.debug("[reader] advanced past cover");
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
          console.debug("[reader] initial display defaulted");
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

  // Outer clipping only — no styles on epub.js internals.
  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-white"
      data-testid="epub-reader"
    />
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
