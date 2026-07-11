import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Columns2,
  LocateFixed,
  Search,
  X,
} from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";

import { epubLocatorAt } from "@prosodio/align/browser";

import { AlignmentViewer } from "#/components/AlignmentViewer";
import { EMPTY_SEARCH } from "#/components/EpubReader";
import { PlayerDock, SPEED_STEPS } from "#/components/PlayerDock";
import { fetchBook } from "#/server/library";
import type { ActiveTokenInfo } from "#/components/AlignmentViewer";
import type { PreparedAlignment } from "#/lib/alignment-client";
import type {
  LocateResult,
  ReaderController,
  SearchState,
  TocItem,
} from "#/components/EpubReader";

type LocateFailure = Extract<LocateResult, { ok: false }>;

const EpubReader = lazy(() =>
  import("#/components/EpubReader").then((m) => ({ default: m.EpubReader })),
);

export const Route = createFileRoute("/player/$bookId")({
  loader: ({ params }) => fetchBook({ data: params.bookId }),
  component: PlayerPage,
});

// Three bands: single-row top bar, dominant reader, bottom dock
// (transcript strip + transport).
function PlayerPage() {
  const book = Route.useLoaderData();

  const [controller, setController] = useState<ReaderController | null>(null);
  const [toc, setToc] = useState<Array<TocItem>>([]);
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH);
  const [panelOpen, setPanelOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [readerError, setReaderError] = useState<string | null>(null);
  const [locateFailure, setLocateFailure] = useState<LocateFailure | null>(
    null,
  );
  // Alignment split: default on (plan D3) whenever both sides exist.
  const canAlign = book.hasEpub && book.hasVtt;
  const [alignOpen, setAlignOpen] = useState(canAlign);
  // Reader follow (plan D6): the reader tracks the active matched token while
  // on; any manual reader navigation disengages it.
  const [followReader, setFollowReader] = useState(canAlign);
  const lastFollowedSeqRef = useRef(-1);
  // The prepared artifact (plan D7/P2), lifted from the AlignmentViewer's own
  // fetch + derive pass — resolution happens entirely client-side from here
  // on, no further server round-trips.
  const [prepared, setPrepared] = useState<PreparedAlignment | null>(null);
  const latestTokenRef = useRef<ActiveTokenInfo | null>(null);
  const audio = useAudioTransport(book.id);

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

  const onPrepared = useCallback((next: PreparedAlignment) => {
    setPrepared(next);
  }, []);

  // "Show in book": resolve the token's EPUB locator against the prepared
  // artifact and resolve it to a Range entirely in the browser (plan D7) — no
  // server round-trip.
  const showInBook = useCallback(
    (token: ActiveTokenInfo) => {
      if (!controller || !prepared || token.epubSeq === null) return;
      const located = epubLocatorAt(prepared.artifact.epub, token.epubSeq);
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
    [controller, prepared],
  );

  // Token transitions drive reader follow independently of visual styling in
  // the alignment panel.
  const onActiveToken = useCallback(
    (token: ActiveTokenInfo | null) => {
      latestTokenRef.current = token;
      if (!followReader || !token || token.epubSeq === null) return;
      if (lastFollowedSeqRef.current === token.epubSeq) return;
      lastFollowedSeqRef.current = token.epubSeq;
      showInBook(token);
    },
    [followReader, showInBook],
  );

  // Re-enabling follow locates the current token immediately rather than
  // waiting for the next transition.
  const toggleFollow = useCallback(() => {
    const enabling = !followReader;
    setFollowReader(enabling);
    const latest = latestTokenRef.current;
    if (enabling && latest && latest.epubSeq !== null) {
      lastFollowedSeqRef.current = latest.epubSeq;
      showInBook(latest);
    }
  }, [followReader, showInBook]);

  const { results, activeIndex, searching, query } = searchState;
  // After a result is chosen the panel collapses to a mini-pager, so the
  // results stay actionable without an overlay eating the reader.
  const showResultList = panelOpen && activeIndex === null;

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      {/* Top bar: navigation + book identity + reader controls, one row. */}
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
            onClick={toggleFollow}
            className={`p-1 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              followReader ? "text-cyan-400" : "text-slate-400"
            }`}
            aria-label={
              followReader
                ? "Stop following playback in book"
                : "Follow playback in book"
            }
            aria-pressed={followReader}
            title="Follow playback in book"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        )}
        {canAlign && (
          <button
            type="button"
            onClick={() => setAlignOpen((open) => !open)}
            className={`p-1 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500 ${
              alignOpen ? "text-cyan-400" : "text-slate-400"
            }`}
            aria-label={
              alignOpen ? "Hide alignment panel" : "Show alignment panel"
            }
            aria-pressed={alignOpen}
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
        {book.hasEpub && !readerError && (
          <>
            {toc.length > 0 && (
              <select
                aria-label="Chapters"
                className="max-w-36 truncate rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:max-w-52"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    setFollowReader(false);
                    controller?.goTo(e.target.value);
                  }
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Chapters…
                </option>
                {toc.map((item) => (
                  <option key={item.href} value={item.href}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => {
                setFollowReader(false);
                controller?.prev();
              }}
              className="p-1 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setFollowReader(false);
                controller?.next();
              }}
              className="p-1 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => (panelOpen ? closeSearch() : setPanelOpen(true))}
              className="p-1 text-slate-400 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-500"
              aria-label={panelOpen ? "Close search" : "Search book"}
            >
              {panelOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </>
        )}
      </header>

      {/* Search: bounded panel under the top bar (full-width sheet on
          mobile, right-aligned panel on desktop); collapses to a mini-pager
          once a result is active. */}
      {showResultList && (
        <div className="absolute inset-x-0 top-10 z-20 max-h-[45vh] overflow-y-auto border-b border-slate-700 bg-slate-900/95 p-2 shadow-xl backdrop-blur-sm sm:left-auto sm:right-2 sm:w-96 sm:rounded-b-lg sm:border-x">
          <form onSubmit={submitSearch} className="flex items-center gap-1.5">
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search this book…"
              className="min-w-0 flex-1 rounded bg-slate-700 px-2 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-500"
              autoFocus
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded bg-cyan-700 px-2.5 py-1.5 text-sm text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {searching ? "…" : "Go"}
            </button>
            <button
              type="button"
              onClick={closeSearch}
              className="p-1.5 text-slate-400 hover:text-white"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </form>
          {query && !searching && (
            <p className="px-1 pt-2 text-[11px] text-slate-500">
              {results.length === 0
                ? `No results for "${query}"`
                : `${results.length}${results.length >= 100 ? "+" : ""} results`}
            </p>
          )}
          {results.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {results.map((result, index) => (
                <li key={result.cfi}>
                  <button
                    type="button"
                    onClick={() => {
                      setFollowReader(false);
                      controller?.gotoResult(index);
                    }}
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs text-slate-300 transition-colors hover:bg-slate-700"
                  >
                    {result.excerpt}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {panelOpen && activeIndex !== null && (
        <div className="absolute right-2 top-10 z-20 flex items-center gap-1 rounded-b-lg border border-t-0 border-slate-700 bg-slate-900/95 px-2 py-1 shadow-xl backdrop-blur-sm">
          <span className="text-xs tabular-nums text-slate-400">
            {activeIndex + 1}/{results.length}
          </span>
          <button
            type="button"
            onClick={() => controller?.gotoResult(Math.max(activeIndex - 1, 0))}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Previous result"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              controller?.gotoResult(
                Math.min(activeIndex + 1, results.length - 1),
              )
            }
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Next result"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setSearchState((s) => ({ ...s, activeIndex: null }))}
            className="px-1 text-xs text-slate-400 hover:text-white"
          >
            results
          </button>
          <button
            type="button"
            onClick={closeSearch}
            className="p-1 text-slate-400 hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Reader band — the dominant surface. */}
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
          // ResizeObserver re-paginates on toggle).
          <div className="flex h-full min-h-0 flex-col sm:flex-row">
            <div className="min-h-0 min-w-0 flex-1">
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
                />
              </Suspense>
            </div>
            {canAlign && alignOpen && (
              <div className="min-h-0 min-w-0 flex-1 border-t border-slate-700 sm:border-l sm:border-t-0">
                <AlignmentViewer
                  bookId={book.id}
                  currentTime={audio.currentTime}
                  onSeek={audio.seek}
                  onShowInBook={showInBook}
                  onActiveToken={onActiveToken}
                  onPrepared={onPrepared}
                  locateFailure={locateFailure}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom dock: transcript strip + transport. */}
      <audio ref={audio.ref} src={`/api/audio/${book.id}`} preload="metadata" />
      <PlayerDock
        bookId={book.id}
        title={book.title}
        author={book.author}
        hasEpub={book.hasEpub}
        hasVtt={book.hasVtt}
        playing={audio.playing}
        currentTime={audio.currentTime}
        duration={audio.duration}
        speed={audio.speed}
        volume={audio.volume}
        audioError={audio.error}
        onTogglePlay={audio.togglePlay}
        onSeek={audio.seek}
        onSkip={audio.skip}
        onCycleSpeed={audio.cycleSpeed}
        onVolume={audio.setVolume}
      />
    </div>
  );
}

function audioPosKey(bookId: string): string {
  return `bookplayer:${bookId}:audio`;
}

/** Audio element state + transport actions + keyboard + resume. */
function useAudioTransport(bookId: string) {
  const ref = useRef<HTMLAudioElement>(null);
  const lastSaveRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    const savePos = (time: number) => {
      try {
        localStorage.setItem(audioPosKey(bookId), String(time));
      } catch {
        /* persistence is best-effort */
      }
    };
    const safeDuration = () =>
      Number.isFinite(audio.duration) ? audio.duration : 0;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      const now = Date.now();
      if (now - lastSaveRef.current > 2000) {
        savePos(audio.currentTime);
        lastSaveRef.current = now;
      }
    };
    const onLoadedMetadata = () => {
      setDuration(safeDuration());
      try {
        const saved = Number.parseFloat(
          localStorage.getItem(audioPosKey(bookId)) ?? "",
        );
        if (Number.isFinite(saved) && saved > 0 && saved < audio.duration) {
          audio.currentTime = saved;
        }
      } catch {
        /* resume is best-effort */
      }
    };
    const onDurationChange = () => setDuration(safeDuration());
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      savePos(audio.currentTime);
    };
    const onError = () =>
      setError("file missing or unsupported — the reader still works");

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("error", onError);
    return () => {
      if (audio.currentTime > 0) savePos(audio.currentTime);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [bookId]);

  const togglePlay = useCallback(() => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seek = useCallback((sec: number) => {
    const audio = ref.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, sec);
    setCurrentTime(audio.currentTime);
  }, []);

  const skip = useCallback((delta: number) => {
    const audio = ref.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + delta), max);
    setCurrentTime(audio.currentTime);
  }, []);

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const index = SPEED_STEPS.indexOf(
        current as (typeof SPEED_STEPS)[number],
      );
      const next = SPEED_STEPS[(index + 1) % SPEED_STEPS.length] ?? 1;
      if (ref.current) ref.current.playbackRate = next;
      return next;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (ref.current) ref.current.volume = v;
  }, []);

  // Keyboard transport: Space play/pause, arrows ±15 s, Shift+arrows ±1 m.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      switch (event.key) {
        case " ":
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          skip(event.shiftKey ? -60 : -15);
          break;
        case "ArrowRight":
          event.preventDefault();
          skip(event.shiftKey ? 60 : 15);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, skip]);

  return {
    ref,
    playing,
    currentTime,
    duration,
    speed,
    volume,
    error,
    togglePlay,
    seek,
    skip,
    cycleSpeed,
    setVolume,
  };
}
