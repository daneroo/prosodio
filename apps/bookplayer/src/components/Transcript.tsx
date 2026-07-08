/**
 * Transcript strip: always rendered (fixed height, own virtualized scroll), with
 * explicit loading / error / no-transcript states. Cues come pre-parsed in
 * seconds from the fetchTranscript server function; the active cue follows
 * currentTime (shared machinery: #/lib/cues), click seeks, auto-scroll keeps
 * the active cue visible without yanking the page.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";

import { activeCueIndex } from "#/lib/cues";
import { fetchTranscript } from "#/server/library";
import type { TranscriptCue } from "#/lib/transcript";

interface TranscriptProps {
  bookId: string;
  currentTime: number;
  onSeek: (sec: number) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "none" }
  | { status: "ready"; cues: Array<TranscriptCue> };

export function Transcript({ bookId, currentTime, onSeek }: TranscriptProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchTranscript({ data: bookId })
      .then(({ cues }) => {
        if (cancelled) return;
        setState(cues ? { status: "ready", cues } : { status: "none" });
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

  const cues = state.status === "ready" ? state.cues : [];
  const rowVirtualizer = useVirtualizer({
    count: cues.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 24,
    getItemKey: (index) => `${cues[index]?.startSec ?? index}-${index}`,
    overscan: 8,
  });

  useEffect(() => {
    if (activeIndex < 0) return;
    rowVirtualizer.scrollToIndex(activeIndex, { align: "auto" });
  }, [activeIndex, rowVirtualizer]);

  if (state.status !== "ready") {
    const message =
      state.status === "loading"
        ? "Loading transcript…"
        : state.status === "error"
          ? "Transcript failed to load"
          : "No transcript available";
    return (
      <div className="flex h-16 items-center justify-center border-t border-slate-700 bg-slate-900/60">
        <p
          className={`text-xs text-slate-500 ${state.status === "loading" ? "animate-pulse" : ""}`}
        >
          {message}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="h-28 overflow-y-auto border-t border-slate-700 bg-slate-900/60"
      data-testid="transcript-strip"
    >
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const cue = cues[virtualRow.index];
          if (!cue) return null;
          const isActive = virtualRow.index === activeIndex;
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full px-3 py-0.5"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <button
                type="button"
                onClick={() => onSeek(cue.startSec)}
                className={`block w-full rounded px-2 py-0.5 text-left text-xs transition-colors ${
                  isActive
                    ? "bg-cyan-900/50 font-medium text-cyan-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {cue.text}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
