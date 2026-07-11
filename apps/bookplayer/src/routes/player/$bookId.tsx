import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, BookOpenText, Columns2, LocateFixed } from "lucide-react";
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
import { ReaderToolbar } from "#/components/ReaderToolbar";
import { SearchPanel } from "#/components/SearchPanel";
import { seekTargetForBookPoint, usePlayerSync } from "#/lib/player-sync";
import { fetchBook } from "#/server/library";
import type { ActiveTokenInfo } from "#/lib/player-sync";
import type {
  LocateResult,
  ReaderController,
  SearchState,
  TocItem,
  WordActivatePoint,
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
  // Reader follow (plan D6): the reader tracks the active matched token while
  // on; any manual reader navigation disengages it.
  const [followReader, setFollowReader] = useState(canAlign);
  const lastFollowedSeqRef = useRef(-1);
  const audio = useAudioTransport(book.id);
  // Sync core (plan player-sync-core, S1): owns the artifact fetch/prepare
  // pass and derives the active token/cue from the playhead — independent of
  // whether the alignment panel is mounted (S2), so follow works with it
  // closed.
  const sync = usePlayerSync(book.id, audio.currentTime, canAlign);

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
  // (a fresh pick disengages follow, matching Chapters/pager) and the
  // collapsed mini-pager (prev/next within an already-chosen result leaves
  // follow as-is — it's just paging the same match, not a new navigation).
  const gotoResult = useCallback(
    (index: number, opts?: { disengageFollow?: boolean }) => {
      if (opts?.disengageFollow) setFollowReader(false);
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
  // moves. Follow is NOT disengaged: a deliberate seek re-syncs playback,
  // and resetting lastFollowedSeqRef makes the follow effect (below)
  // re-locate from the new position on the very next token transition
  // instead of treating it as already-followed.
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
      audio.seek(target.timeSec);
      lastFollowedSeqRef.current = -1;
    },
    [sync.prepared, audio],
  );

  // Token transitions drive reader follow independently of whether the
  // alignment panel is mounted — `sync.activeToken` is derived at the route
  // regardless of AlignmentViewer (plan player-sync-core, S2). `alignOpen`
  // must NOT gate this effect.
  useEffect(() => {
    const token = sync.activeToken;
    if (!followReader || !token || token.epubSeq === null) return;
    if (lastFollowedSeqRef.current === token.epubSeq) return;
    lastFollowedSeqRef.current = token.epubSeq;
    showInBook(token);
  }, [sync.activeToken, followReader, showInBook]);

  // Re-enabling follow locates the current token immediately rather than
  // waiting for the next transition.
  const toggleFollow = useCallback(() => {
    const enabling = !followReader;
    setFollowReader(enabling);
    const latest = sync.activeToken;
    if (enabling && latest && latest.epubSeq !== null) {
      lastFollowedSeqRef.current = latest.epubSeq;
      showInBook(latest);
    }
  }, [followReader, sync.activeToken, showInBook]);

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      {/* Top bar: navigation + book identity + follow/alignment/lab toggles.
          Reader controls (Chapters/pager/search) live with the reader pane
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
          // ResizeObserver re-paginates on toggle). The reader pane is a
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
                onDisengageFollow={() => setFollowReader(false)}
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
                  onSeek={audio.seek}
                  onShowInBook={showInBook}
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
