/**
 * epub.js reader. Owns the whole epubjs lifecycle (dynamic client-only
 * import) and pushes state up through callbacks; the player route owns the
 * chrome. Lessons encoded from the experiment record:
 * - load lifecycle keyed to epubUrl only — relocation must never re-open
 * - range CFIs from Section.find are normalized to start points for
 *   display, while the highlight uses the full range
 * - only the outer container clips; epub.js internal scroll math is left
 *   alone, or highlights land off-screen
 * - on resize, the active search target is re-displayed so a reflow cannot
 *   lose the match (the desktop-to-mobile bug from visual review)
 */
import { useEffect, useRef } from "react";

import type { Book, NavItem, Rendition } from "epubjs";

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

export interface ReaderController {
  prev: () => void;
  next: () => void;
  goTo: (href: string) => void;
  search: (query: string) => Promise<void>;
  gotoResult: (index: number) => void;
  clearSearch: () => void;
}

export const EMPTY_SEARCH: SearchState = {
  query: "",
  searching: false,
  results: [],
  activeIndex: null,
};

interface EpubReaderProps {
  bookId: string;
  epubUrl: string;
  onController: (controller: ReaderController | null) => void;
  onToc: (items: Array<TocItem>) => void;
  onSearchState: (state: SearchState) => void;
  onError: (message: string) => void;
}

const MAX_RESULTS = 100;

function cfiKey(bookId: string): string {
  return `bookplayer:${bookId}:cfi`;
}

/** Range CFI → start-point CFI for display (IndexSizeError guard). */
function normalizeCfi(cfi: string): string {
  if (!cfi.includes(",")) return cfi;
  const base = cfi.split(",")[0] ?? cfi;
  return base.endsWith(")") ? base : `${base})`;
}

export function EpubReader({
  bookId,
  epubUrl,
  onController,
  onToc,
  onSearchState,
  onError,
}: EpubReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onController, onToc, onSearchState, onError });
  callbacksRef.current = { onController, onToc, onSearchState, onError };
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
      void rendition.display(normalizeCfi(result.cfi)).then(() => {
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
        const { default: ePub } = await import("epubjs");
        if (!alive()) return;

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

        // Spine items exist only after the book is fully opened.
        await book.ready;
        if (!alive()) return;

        // First open: saved location, else the first readable (non-cover)
        // spine item so text, not cover art, is the default surface.
        const savedCfi = localStorage.getItem(cfiKey(bookIdRef.current));
        if (savedCfi) {
          await rendition.display(savedCfi);
        } else {
          await rendition.display(firstReadableHref(book) ?? undefined);
          // Cover pages hide behind generic hrefs too: if the first view has
          // almost no text (image-only page), advance once so first open
          // shows readable content.
          if (alive() && visibleTextLength(rendition) < 200) {
            await rendition.next();
          }
        }

        const nav = await book.loaded.navigation;
        callbacksRef.current.onToc(
          nav.toc.map((item: NavItem) => ({
            label: item.label.trim(),
            href: item.href,
          })),
        );

        // Re-display the search target after container resizes settle, so a
        // reflow cannot lose the match the user just navigated to.
        resizeObserver = new ResizeObserver(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (!alive() || !rendition || !resumeTarget.cfi) return;
            void rendition.display(normalizeCfi(resumeTarget.cfi));
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
  linear: boolean;
  load: (loader: unknown) => Promise<unknown>;
  unload: () => void;
  find: (query: string) => Array<{ cfi: string; excerpt: string }>;
}

function spineItems(book: Book): Array<SpineItemLike> {
  return (book.spine as unknown as { spineItems: Array<SpineItemLike> })
    .spineItems;
}

function firstReadableHref(book: Book): string | null {
  for (const item of spineItems(book)) {
    if (item.linear && !/cover/i.test(item.href)) return item.href;
  }
  return null;
}

function visibleTextLength(rendition: Rendition): number {
  try {
    const contents = (
      rendition as unknown as {
        getContents: () => Array<{ document?: Document }>;
      }
    ).getContents();
    return contents.reduce((sum, c) => {
      const text = c.document?.body.textContent ?? "";
      return sum + text.trim().length;
    }, 0);
  } catch {
    return Number.MAX_SAFE_INTEGER; // unknown: don't skip anything
  }
}

/** Spine-wide search: load/find/unload per section, capped and deduped. */
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
