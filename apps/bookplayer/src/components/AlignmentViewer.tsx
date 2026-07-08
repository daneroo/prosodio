/**
 * Alignment panel: the transcript cue list annotated with word-level
 * match/mismatch from the alignment engine (plan
 * thoughts/plans/bookplayer-align.md). Matches are word-by-word — one cue can
 * mix matched and unmatched tokens. During playback the active cue and its
 * active token are highlighted. Residual-gap markers flag book content the
 * narration never reads. Click seeks; shared time-interval machinery is in
 * #/lib/cues.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";

import { decodeAlignedCues } from "#/lib/alignment-wire";
import { activeCueIndex, activeTokenIndex } from "#/lib/cues";
import { formatDuration } from "#/lib/browse";
import { fetchAlignment } from "#/server/library";
import type { LocateResult } from "#/components/EpubReader";
import type {
  AlignedCue,
  AlignedToken,
  AlignmentPayload,
} from "#/lib/alignment-wire";

type LocateFailure = Extract<LocateResult, { ok: false }>;

interface AlignmentViewerProps {
  bookId: string;
  currentTime: number;
  onSeek: (sec: number) => void;
  /** "Show in book": the double-clicked aligned token. */
  onShowInBook?: (token: AlignedToken) => void;
  /** The active token's EPUB position used for reader follow. This remains
   * token-level even though the UI highlights only the containing cue. */
  onActiveToken?: (token: AlignedToken | null) => void;
  /** The full payload once loaded, so the route can drive the reader without
   * a second fetch (the compact EPUB locator index lives here too). */
  onPayload?: (payload: AlignmentPayload) => void;
  /** Last failed EPUB follow/show-in-book attempt; rendered as a status hint. */
  locateFailure?: LocateFailure | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | Extract<AlignmentPayload, { status: "ready" }>;

type AlignmentRow =
  | { kind: "gap"; key: string; tokens: number }
  | { kind: "cue"; key: string; cue: AlignedCue; cueIndex: number };

export function AlignmentViewer({
  bookId,
  currentTime,
  onSeek,
  onShowInBook,
  onActiveToken,
  onPayload,
  locateFailure,
}: AlignmentViewerProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const onActiveTokenRef = useRef(onActiveToken);
  onActiveTokenRef.current = onActiveToken;
  const onPayloadRef = useRef(onPayload);
  onPayloadRef.current = onPayload;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchAlignment({ data: bookId })
      .then((payload) => {
        if (cancelled) return;
        setState(
          payload.status === "ready" ? payload : { status: "unavailable" },
        );
        if (payload.status === "ready") onPayloadRef.current?.(payload);
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // Decode the compact wire columns back into the UI's AlignedCue[] shape
  // once per payload, not once per render (Phase 7c: the server ships
  // columnar base64 typed arrays instead of fat per-token JSON).
  const decodedCues = useMemo(
    () =>
      state.status === "ready"
        ? decodeAlignedCues(state.cues, state.tokens)
        : [],
    [state],
  );

  const activeIndex = useMemo(
    () =>
      state.status === "ready" ? activeCueIndex(decodedCues, currentTime) : -1,
    [state, decodedCues, currentTime],
  );

  // Keep token-level selection as both the EPUB-follow signal and the active
  // word highlight inside the active cue.
  const activeToken = useMemo(() => {
    if (state.status !== "ready" || activeIndex < 0) return -1;
    const cue = decodedCues[activeIndex];
    if (!cue) return -1;
    return activeTokenIndex(cue.tokens, currentTime);
  }, [state, decodedCues, activeIndex, currentTime]);

  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    const nextRows: Array<AlignmentRow> = [];
    if (state.summary.leadingGapEpubTokens > 0) {
      nextRows.push({
        kind: "gap",
        key: "leading-gap",
        tokens: state.summary.leadingGapEpubTokens,
      });
    }
    decodedCues.forEach((cue, cueIndex) => {
      nextRows.push({
        kind: "cue",
        key: `cue-${cue.startSec}-${cueIndex}`,
        cue,
        cueIndex,
      });
      if (cue.gapEpubTokens > 0) {
        nextRows.push({
          kind: "gap",
          key: `gap-${cue.startSec}-${cueIndex}`,
          tokens: cue.gapEpubTokens,
        });
      }
    });
    return nextRows;
  }, [state, decodedCues]);

  const activeRowIndex = useMemo(
    () =>
      activeIndex < 0
        ? -1
        : rows.findIndex(
            (row) => row.kind === "cue" && row.cueIndex === activeIndex,
          ),
    [rows, activeIndex],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 26,
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 8,
  });

  useEffect(() => {
    if (activeRowIndex < 0) return;
    rowVirtualizer.scrollToIndex(activeRowIndex, { align: "auto" });
  }, [activeRowIndex, rowVirtualizer]);

  const activeTokenValue: AlignedToken | null =
    state.status === "ready" && activeIndex >= 0 && activeToken >= 0
      ? (decodedCues[activeIndex]?.tokens[activeToken] ?? null)
      : null;
  useEffect(() => {
    onActiveTokenRef.current?.(activeTokenValue);
    // The indexes identify the transition; activeTokenValue is derived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, activeToken]);

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

  const { summary } = state;
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-slate-900/60"
      data-testid="alignment-viewer"
    >
      <div className="shrink-0 border-b border-slate-700 px-3 py-1.5 text-[11px] text-slate-500">
        {locateFailure && (
          <span
            className="mr-2 font-medium text-rose-400"
            title={`EPUB location failed: ${locateFailure.reason}. Open the console for details.`}
          >
            ✕ location
          </span>
        )}
        <span className="tabular-nums">
          narration {percent(summary.vttCoverage)} · book{" "}
          {percent(summary.epubCoverage)} · {summary.spanCount} spans ·{" "}
          {summary.gapCount} gaps
        </span>
        {summary.timing === "interpolated" && (
          <span className="ml-2 text-slate-600">(interpolated times)</span>
        )}
      </div>
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
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
                {row.kind === "gap" ? (
                  <GapMarker tokens={row.tokens} />
                ) : (
                  <CueRow
                    cue={row.cue}
                    isActive={row.cueIndex === activeIndex}
                    activeToken={activeToken}
                    onSeek={onSeek}
                    onShowInBook={onShowInBook}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CueRow({
  cue,
  isActive,
  activeToken,
  onSeek,
  onShowInBook,
}: {
  cue: AlignedCue;
  isActive: boolean;
  activeToken: number;
  onSeek: (sec: number) => void;
  onShowInBook?: (token: AlignedToken) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSeek(cue.startSec)}
      className={`block w-full rounded px-2 py-0.5 text-left text-xs transition-colors ${
        isActive ? "bg-cyan-900/50" : "hover:bg-slate-800"
      }`}
    >
      <span className="mr-1.5 text-[10px] tabular-nums text-slate-600">
        {formatDuration(cue.startSec)}
      </span>
      {cue.tokens.map((token, tokenIndex) => {
        const isActiveToken = isActive && tokenIndex === activeToken;
        const canShowToken =
          onShowInBook !== undefined && token.matched && token.epubSeq !== null;
        return (
          <span
            key={tokenIndex}
            className={`${canShowToken ? "cursor-pointer" : ""} ${
              isActiveToken
                ? "rounded-sm bg-cyan-400/30 text-white"
                : token.matched
                  ? isActive
                    ? "text-cyan-300"
                    : "text-slate-300"
                  : "text-rose-400/90"
            }`}
            onDoubleClick={(event) => {
              if (!canShowToken) return;
              event.stopPropagation();
              onShowInBook(token);
            }}
            title={canShowToken ? "Double-click to show in book" : undefined}
          >
            {tokenIndex > 0 ? " " : ""}
            {token.raw}
          </span>
        );
      })}
    </button>
  );
}

/** Book content the narration never reads (a residual gap's EPUB side). */
function GapMarker({ tokens }: { tokens: number }) {
  return (
    <p className="px-2 py-0.5 text-[10px] italic text-amber-500/80">
      ~{tokens} words not narrated
    </p>
  );
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
