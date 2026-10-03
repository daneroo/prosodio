import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpenText,
  Columns2,
  Link2,
  Link2Off,
} from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";

import { epubLocatorAt } from "@prosodio/align/browser";

import { AlignmentViewer } from "#/components/AlignmentViewer";
import { EMPTY_SEARCH, FONT_NAMES, THEME_NAMES } from "#/components/EpubReader";
import { ReaderToolbar } from "#/components/ReaderToolbar";
import { SearchPanel } from "#/components/SearchPanel";
import { seekTargetForBookPoint, usePlayerSync } from "#/lib/player-sync";
import type { ActiveTokenInfo } from "#/lib/player-sync";
import type { BookRow } from "#/server/library";
import type {
  FontName,
  LocateResult,
  ReaderController,
  SearchState,
  ThemeName,
  TocItem,
  WordActivatePoint,
} from "#/components/EpubReader";

type LocateFailure = Extract<LocateResult, { ok: false }>;

/** Global, not per-book: whether the alignment split is shown. */
const ALIGN_OPEN_KEY = "bookplayer:align-open";

const EpubReader = lazy(() =>
  import("#/components/EpubReader").then((m) => ({ default: m.EpubReader })),
);

interface PlayerViewProps {
  book: BookRow;
  /** Seconds into the audiobook; drives the active token/cue. */
  audioPosition: number;
  /** Moves the audio position (alignment panel click, reverse sync). */
  onSeek: (sec: number) => void;
  /** Bottom bar content, owned by the player that renders this view. */
  bottomBar: ReactNode;
}

// Shared player view, three bands: single-row top bar, dominant ebook panel
// (plus the alignment panel), and the bottom bar its caller supplies.
export function PlayerView({
  book,
  audioPosition,
  onSeek,
  bottomBar,
}: PlayerViewProps) {
  const [controller, setController] = useState<ReaderController | null>(null);
  const [toc, setToc] = useState<Array<TocItem>>([]);
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH);
  // Reading theme/font (plan T2): fed by EpubReader's onThemeChange/
  // onFontChange (fired once on init with the localStorage-derived value,
  // and again on every setTheme/setFont), same shape as toc/controller
  // above. "default"/"iowan" are placeholder initial values only — the real
  // first-paint-correct value comes from the init callback, same reasoning
  // as EpubReader's own lazy initializers (design §4, §6 decision 3).
  const [theme, setTheme] = useState<ThemeName>("default");
  const [font, setFont] = useState<FontName>("iowan");
  const cycleTheme = useCallback(() => {
    // `?? "default"` is defensive only (noUncheckedIndexedAccess): `theme`
    // always came from THEME_NAMES itself, so the modulo index is always in
    // range.
    const next =
      THEME_NAMES[(THEME_NAMES.indexOf(theme) + 1) % THEME_NAMES.length] ??
      "default";
    controller?.setTheme(next);
  }, [controller, theme]);
  const cycleFont = useCallback(() => {
    const next =
      FONT_NAMES[(FONT_NAMES.indexOf(font) + 1) % FONT_NAMES.length] ?? "iowan";
    controller?.setFont(next);
  }, [controller, font]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [readerError, setReaderError] = useState<string | null>(null);
  const [locateFailure, setLocateFailure] = useState<LocateFailure | null>(
    null,
  );
  // Reverse-sync refusal notice (plan S4/S5): transient, auto-dismissing —
  // lighter-weight than locateFailure since it's shown regardless of whether
  // the alignment panel is open.
  const [reverseSyncNotice, setReverseSyncNotice] = useState<string | null>(
    null,
  );
  const reverseSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(
    () => () => {
      if (reverseSyncTimerRef.current)
        clearTimeout(reverseSyncTimerRef.current);
    },
    [],
  );
  // Alignment split: default on (plan D3) whenever both sides exist.
  const canAlign = book.hasEpub && book.hasVtt;
  const [alignOpen, setAlignOpen] = useState(canAlign);
  // Persisted globally (a layout preference, like the reader theme). Read
  // after mount, not in the initializer: the server can't see localStorage,
  // so reading it during render would mismatch hydration.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ALIGN_OPEN_KEY);
      if (stored !== null) setAlignOpen(stored === "1");
    } catch {
      /* persistence is best-effort */
    }
  }, []);
  const toggleAlign = useCallback(() => {
    const next = !alignOpen;
    setAlignOpen(next);
    try {
      localStorage.setItem(ALIGN_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* persistence is best-effort */
    }
  }, [alignOpen]);
  // Link (plan D6, there "reader follow"): while linked, the ebook panel
  // keeps the active matched token in view; any manual ebook navigation
  // unlinks it.
  const [linked, setLinked] = useState(canAlign);
  const lastLocatedSeqRef = useRef(-1);
  // Sync core (plan player-sync-core, S1): owns the artifact fetch/prepare
  // pass and derives the active token/cue from the audio position —
  // independent of whether the alignment panel is mounted (S2), so the link
  // works with it closed.
  const sync = usePlayerSync(book.id, audioPosition, canAlign);

  const submitSearch = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void controller?.search(queryInput);
    },
    [controller, queryInput],
  );

  const closeSearch = useCallback(() => {
    setPanelOpen(false);
    setQueryInput("");
    controller?.clearSearch();
  }, [controller]);

  // Jumping to a specific result index is shared by the full result list
  // (a fresh pick unlinks, matching Chapters/pager) and the collapsed
  // mini-pager (prev/next within an already-chosen result leaves the link
  // as-is — it's just paging the same match, not a new navigation).
  const gotoResult = useCallback(
    (index: number, opts?: { unlink?: boolean }) => {
      if (opts?.unlink) setLinked(false);
      controller?.gotoResult(index);
    },
    [controller],
  );

  const showResults = useCallback(() => {
    setSearchState((s) => ({ ...s, activeIndex: null }));
  }, []);

  // "Show in book": resolve the token's EPUB locator against the prepared
  // artifact and resolve it to a Range entirely in the browser (plan D7) — no
  // server round-trip.
  const showInBook = useCallback(
    (token: ActiveTokenInfo) => {
      if (!controller || !sync.prepared || token.epubSeq === null) return;
      const located = epubLocatorAt(sync.prepared.artifact.epub, token.epubSeq);
      if (!located) return;
      const { spineHref, segPaths, segTextLen, loc } = located;
      const locator = {
        spineHref,
        segPaths,
        segTextLen,
        loc,
        expectedRaw: token.raw,
      };
      void controller
        .locate(locator)
        .then((result) => {
          if (result.ok) {
            setLocateFailure(null);
          } else {
            setLocateFailure(result);
          }
        })
        .catch((error) => {
          const result: LocateFailure = {
            ok: false,
            reason: "unexpected-error",
            locator,
            details: { error },
          };
          console.warn("[EPUB locate failed]", result);
          setLocateFailure(result);
        });
    },
    [controller, sync.prepared],
  );

  // Reverse-sync gesture (plan S4): double-click a word in the reader ->
  // seek the audio there. Play/pause state is untouched — only position
  // moves. The seek does NOT unlink: it re-syncs playback, and resetting
  // lastLocatedSeqRef makes the link effect (below) re-locate from the new
  // position on the very next token transition instead of treating
  // it as already shown.
  const onWordActivate = useCallback(
    (point: WordActivatePoint) => {
      if (!sync.prepared) return;
      const target = seekTargetForBookPoint(sync.prepared, point);
      if ("error" in target) {
        const message =
          target.error === "no-match-forward"
            ? "word not in the alignment (no match ahead)"
            : "couldn't resolve the clicked word";
        if (reverseSyncTimerRef.current) {
          clearTimeout(reverseSyncTimerRef.current);
        }
        setReverseSyncNotice(message);
        reverseSyncTimerRef.current = setTimeout(
          () => setReverseSyncNotice(null),
          2500,
        );
        return;
      }
      // Seek a hair INTO the token, not exactly onto its boundary: the media
      // element quantizes currentTime and can read back just below the set
      // value, which would make activeTokenAt resolve the PREVIOUS token (the
      // consistent off-by-one-word Daniel observed in P2.6).
      onSeek(target.timeSec + 0.02);
      lastLocatedSeqRef.current = -1;
    },
    [sync.prepared, onSeek],
  );

  // Token transitions drive the link independently of whether the
  // alignment panel is mounted — `sync.activeToken` is derived in this view
  // regardless of AlignmentViewer (plan player-sync-core, S2). `alignOpen`
  // must NOT gate this effect.
  useEffect(() => {
    const token = sync.activeToken;
    if (!linked || !token || token.epubSeq === null) return;
    if (lastLocatedSeqRef.current === token.epubSeq) return;
    lastLocatedSeqRef.current = token.epubSeq;
    showInBook(token);
  }, [sync.activeToken, linked, showInBook]);

  // Re-linking locates the current token immediately rather than
  // waiting for the next transition.
  const toggleLink = useCallback(() => {
    const enabling = !linked;
    setLinked(enabling);
    const latest = sync.activeToken;
    if (enabling && latest && latest.epubSeq !== null) {
      lastLocatedSeqRef.current = latest.epubSeq;
      showInBook(latest);
    }
  }, [linked, sync.activeToken, showInBook]);

  // Header toggles: one string serves as both the accessible name and the
  // hover tooltip, and names the action a click performs.
  const LinkIcon = linked ? Link2 : Link2Off;
  const linkLabel = linked ? "Unlink ebook from audio" : "Link ebook to audio";
  const alignLabel = alignOpen
    ? "Hide alignment panel"
    : "Show alignment panel";

  return (
    <div className="flex h-dvh flex-col bg-slate-900 text-white">
      {/* Top bar: navigation + book identity + link/alignment/lab toggles.
          Reader controls (Chapters/pager/search) live with the ebook panel
          below (plan player-sync-core T2.4). */}
      <header className="relative z-10 flex shrink-0 items-center gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2">
        <Link
          to="/"
          className="shrink-0 p-1 text-slate-400 transition-colors hover:text-white"
          aria-label="Back to library"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-0 truncate text-sm font-medium">
          {book.title}
        </span>
        {book.author && (
          <span className="hidden min-w-0 truncate text-xs text-slate-500 sm:inline">
            — {book.author}
          </span>
        )}
        <div className="flex-1" />
        {canAlign && (
          <button
            type="button"
            onClick={toggleLink}
            className={`p-1 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              linked ? "text-cyan-400" : "text-slate-400"
            }`}
            aria-label={linkLabel}
            aria-pressed={linked}
            title={linkLabel}
          >
            <LinkIcon className="h-4 w-4" />
          </button>
        )}
        {canAlign && (
          <button
            type="button"
            onClick={toggleAlign}
            className={`p-1 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              alignOpen ? "text-cyan-400" : "text-slate-400"
            }`}
            aria-label={alignLabel}
            aria-pressed={alignOpen}
            title={alignLabel}
          >
            <Columns2 className="h-4 w-4" />
          </button>
        )}
        {canAlign && import.meta.env.DEV && (
          <a
            href={`/lab/locate/${book.id}`}
            className="p-1 text-xs text-slate-400 transition-colors hover:text-slate-300"
            title="Locate-coverage sweep (lab)"
          >
            lab
          </a>
        )}
      </header>

      {/* Reverse-sync refusal notice (plan S4/S5): transient, centered under
          the top bar; auto-dismisses via reverseSyncTimerRef above. */}
      {reverseSyncNotice && (
        <div className="pointer-events-none absolute inset-x-0 top-12 z-20 flex justify-center">
          <div className="rounded-full border border-slate-700 bg-slate-900/95 px-3 py-1 text-xs text-rose-300 shadow-xl backdrop-blur-sm">
            {reverseSyncNotice}
          </div>
        </div>
      )}

      {/* Ebook panel — the dominant surface. */}
      <main className="min-h-0 flex-1">
        {!book.hasEpub ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center">
              <BookOpenText className="mx-auto mb-3 h-12 w-12 text-slate-600" />
              <p className="text-sm text-slate-400">
                No EPUB for this title — audio-only book.
              </p>
            </div>
          </div>
        ) : readerError ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center">
              <p className="mb-1 text-sm text-red-400">Unable to load EPUB</p>
              <p className="text-xs text-slate-500">{readerError}</p>
            </div>
          </div>
        ) : (
          // Alignment split (plan D3): desktop side-by-side 50/50, mobile
          // stacks vertically; closed = full-band reader (EpubReader's
          // ResizeObserver re-paginates on toggle). The ebook panel is a
          // flex column: ReaderToolbar on top, then the reader fills the
          // rest; SearchPanel is anchored to the content area below the
          // toolbar (plan player-sync-core T2.4) so it belongs visually to
          // the reader instead of the whole page.
          <div className="flex h-full min-h-0 flex-col sm:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ReaderToolbar
                toc={toc}
                controller={controller}
                panelOpen={panelOpen}
                onOpenSearch={() => setPanelOpen(true)}
                onCloseSearch={closeSearch}
                onUnlink={() => setLinked(false)}
                theme={theme}
                onCycleTheme={cycleTheme}
                font={font}
                onCycleFont={cycleFont}
              />
              <div className="relative min-h-0 flex-1">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <p className="animate-pulse text-sm text-slate-400">
                        Loading EPUB…
                      </p>
                    </div>
                  }
                >
                  <EpubReader
                    bookId={book.id}
                    epubUrl={`/api/epub/${book.id}`}
                    onController={setController}
                    onToc={setToc}
                    onSearchState={setSearchState}
                    onError={setReaderError}
                    onWordActivate={canAlign ? onWordActivate : undefined}
                    onThemeChange={setTheme}
                    onFontChange={setFont}
                  />
                </Suspense>
                <SearchPanel
                  panelOpen={panelOpen}
                  searchState={searchState}
                  queryInput={queryInput}
                  onQueryInput={setQueryInput}
                  onSubmit={submitSearch}
                  onClose={closeSearch}
                  onGotoResult={gotoResult}
                  onShowResults={showResults}
                />
              </div>
            </div>
            {canAlign && alignOpen && (
              <div className="min-h-0 min-w-0 flex-1 border-t border-slate-700 sm:border-l sm:border-t-0">
                <AlignmentViewer
                  prepared={sync.prepared}
                  status={sync.status}
                  activeTokenSeq={sync.activeTokenSeq}
                  activeCueIndex={sync.activeCueIndex}
                  onSeek={onSeek}
                  onShowInBook={showInBook}
                  locateFailure={locateFailure}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {bottomBar}
    </div>
  );
}
