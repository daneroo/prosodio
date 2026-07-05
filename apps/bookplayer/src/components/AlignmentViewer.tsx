/**
 * Alignment panel: the transcript cue list annotated with word-level
 * match/mismatch runs from the alignment engine (plan
 * thoughts/plans/bookplayer-align.md). Matches are word-by-word — one cue can
 * mix matched and unmatched runs. Residual-gap markers flag book content the
 * narration never reads. Follows playback exactly like Transcript (shared
 * machinery: #/lib/cues); click seeks.
 */
import { BookOpenText } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { activeCueIndex } from "#/lib/cues";
import { formatDuration } from "#/lib/browse";
import { fetchAlignment } from "#/server/library";
import type { AlignedCue, AlignmentSummary } from "#/lib/alignment";

interface AlignmentViewerProps {
  bookId: string;
  currentTime: number;
  onSeek: (sec: number) => void;
  /** "Show in book": navigate the reader to this cue's EPUB position. */
  onShowInBook?: (cueIndex: number) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; summary: AlignmentSummary; cues: Array<AlignedCue> };

export function AlignmentViewer({
  bookId,
  currentTime,
  onSeek,
  onShowInBook,
}: AlignmentViewerProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchAlignment({ data: bookId })
      .then((payload) => {
        if (cancelled) return;
        setState(
          payload.status === "ready" ? payload : { status: "unavailable" },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const activeIndex = useMemo(
    () =>
      state.status === "ready" ? activeCueIndex(state.cues, currentTime) : -1,
    [state, currentTime],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex]);

  if (state.status !== "ready") {
    const message =
      state.status === "loading"
        ? "Computing alignment… (first run can take a while)"
        : state.status === "error"
          ? "Alignment failed to load"
          : "No alignment for this book (needs both EPUB and transcript)";
    return (
      <div
        className="flex h-full items-center justify-center bg-slate-900/60 p-4"
        data-testid="alignment-viewer"
      >
        <p
          className={`text-center text-xs text-slate-500 ${state.status === "loading" ? "animate-pulse" : ""}`}
        >
          {message}
        </p>
      </div>
    );
  }

  const { summary, cues } = state;
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-slate-900/60"
      data-testid="alignment-viewer"
    >
      <div className="shrink-0 border-b border-slate-700 px-3 py-1.5 text-[11px] text-slate-500">
        <span className="tabular-nums">
          narration {percent(summary.vttCoverage)} · book{" "}
          {percent(summary.epubCoverage)} · {summary.spanCount} spans ·{" "}
          {summary.gapCount} gaps
        </span>
        {summary.timing === "interpolated" && (
          <span className="ml-2 text-slate-600">(interpolated times)</span>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {summary.leadingGapEpubTokens > 0 && (
          <GapMarker tokens={summary.leadingGapEpubTokens} />
        )}
        {cues.map((cue, index) => {
          const isActive = index === activeIndex;
          const canShow = onShowInBook !== undefined && cue.matchedRatio > 0;
          return (
            <Fragment key={`${cue.startSec}-${index}`}>
              <div className="group relative">
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => onSeek(cue.startSec)}
                  className={`block w-full rounded px-2 py-0.5 text-left text-xs transition-colors ${
                    isActive ? "bg-cyan-900/50" : "hover:bg-slate-800"
                  } ${canShow ? "pr-7" : ""}`}
                >
                  <span className="mr-1.5 text-[10px] tabular-nums text-slate-600">
                    {formatDuration(cue.startSec)}
                  </span>
                  {cue.runs.map((run, runIndex) => (
                    <span
                      key={runIndex}
                      className={
                        run.matched
                          ? isActive
                            ? "text-cyan-300"
                            : "text-slate-300"
                          : "text-rose-400/90"
                      }
                    >
                      {runIndex > 0 ? " " : ""}
                      {run.text}
                    </span>
                  ))}
                </button>
                {canShow && (
                  <button
                    type="button"
                    onClick={() => onShowInBook(index)}
                    className={`absolute right-1 top-0.5 rounded p-0.5 text-slate-500 transition-opacity hover:text-cyan-300 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                      isActive
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                    aria-label="Show in book"
                    title="Show in book"
                  >
                    <BookOpenText className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {cue.gapEpubTokens > 0 && (
                <GapMarker tokens={cue.gapEpubTokens} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** Book content the narration never reads (a residual gap's EPUB side). */
function GapMarker({ tokens }: { tokens: number }) {
  return (
    <p className="px-2 py-0.5 text-[10px] italic text-amber-500/80">
      ⧉ ~{tokens} words in book not narrated
    </p>
  );
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
