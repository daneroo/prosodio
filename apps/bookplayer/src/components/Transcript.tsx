/**
 * Transcript strip: always rendered (capped height, own scroll), with
 * explicit loading / error / no-transcript states. Cues come pre-parsed in
 * seconds from the fetchTranscript server function; the active cue follows
 * currentTime via binary search, click seeks, auto-scroll keeps the active
 * cue visible without yanking the page.
 */
import { useEffect, useMemo, useRef, useState } from "react";

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

/** Index of the cue containing t, else -1 (cues sorted by startSec). */
export function activeCueIndex(cues: Array<TranscriptCue>, t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cue = cues[mid];
    if (!cue) break;
    if (cue.startSec <= t) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate < 0) return -1;
  const cue = cues[candidate];
  return cue && cue.endSec > t ? candidate : -1;
}

export function Transcript({ bookId, currentTime, onSeek }: TranscriptProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const activeRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex]);

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
      className="h-28 space-y-0.5 overflow-y-auto border-t border-slate-700 bg-slate-900/60 px-3 py-2"
      data-testid="transcript-strip"
    >
      {state.cues.map((cue, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={`${cue.startSec}-${index}`}
            ref={isActive ? activeRef : undefined}
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
        );
      })}
    </div>
  );
}
