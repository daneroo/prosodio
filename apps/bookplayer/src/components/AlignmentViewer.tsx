/**
 * Alignment panel: the transcript cue list annotated with word-level
 * match/mismatch from the alignment engine (plan
 * thoughts/plans/bookplayer-align-refine-model.md, T4.2). Matches are
 * word-by-word — one cue can mix matched and unmatched tokens. During
 * playback the active cue and its active token are highlighted. Residual-gap
 * markers flag book content the narration never reads. Click seeks. A pure
 * subscriber (plan thoughts/plans/player-sync-core.md, S2): the route's
 * usePlayerSync hook (lib/player-sync.ts) owns the artifact fetch/prepare and
 * the active-token/cue derivation, so reader follow works with this panel
 * closed; this component only builds rows and renders.
 */
import { useEffect, useMemo, useRef } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";

import { formatDuration } from "#/lib/browse";
import type { PreparedAlignment } from "#/lib/alignment-client";
import type { ActiveTokenInfo, PlayerSync } from "#/lib/player-sync";
import type { LocateResult } from "#/components/EpubReader";

type LocateFailure = Extract<LocateResult, { ok: false }>;

interface AlignmentViewerProps {
  prepared: PreparedAlignment | null;
  status: PlayerSync["status"];
  activeTokenSeq: number;
  activeCueIndex: number;
  onSeek: (sec: number) => void;
  /** "Show in book": the clicked matched token (word clicks seek AND show;
   * see CueRow). */
  onShowInBook?: (token: ActiveTokenInfo) => void;
  /** Last failed EPUB follow/show-in-book attempt; rendered as a status hint. */
  locateFailure?: LocateFailure | null;
}

type AlignmentRow =
  | { kind: "gap"; key: string; tokens: number }
  | { kind: "cue"; key: string; cueIndex: number };

export function AlignmentViewer({
  prepared,
  status,
  activeTokenSeq,
  activeCueIndex,
  onSeek,
  onShowInBook,
  locateFailure,
}: AlignmentViewerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    if (status !== "ready" || !prepared) return [];
    const cueCount = prepared.artifact.vtt.cues.startSec.length;
    const nextRows: Array<AlignmentRow> = [];
    if (prepared.leadingGapEpubTokens > 0) {
      nextRows.push({
        kind: "gap",
        key: "leading-gap",
        tokens: prepared.leadingGapEpubTokens,
      });
    }
    for (let cueIndex = 0; cueIndex < cueCount; cueIndex++) {
      const startSec = prepared.artifact.vtt.cues.startSec[cueIndex]!;
      nextRows.push({
        kind: "cue",
        key: `cue-${startSec}-${cueIndex}`,
        cueIndex,
      });
      const gapTokens = prepared.gapEpubTokens[cueIndex] ?? 0;
      if (gapTokens > 0) {
        nextRows.push({
          kind: "gap",
          key: `gap-${startSec}-${cueIndex}`,
          tokens: gapTokens,
        });
      }
    }
    return nextRows;
  }, [status, prepared]);

  const activeRowIndex = useMemo(
    () =>
      activeCueIndex < 0
        ? -1
        : rows.findIndex(
            (row) => row.kind === "cue" && row.cueIndex === activeCueIndex,
          ),
    [rows, activeCueIndex],
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

  if (status !== "ready" || !prepared) {
    const message =
      status === "loading"
        ? "Computing alignment… (first run can take a while)"
        : status === "error"
          ? "Alignment failed to load"
          : "No alignment for this book (needs both EPUB and transcript)";
    return (
      <div
        className="flex h-full items-center justify-center bg-slate-900/60 p-4"
        data-testid="alignment-viewer"
      >
        <p
          className={`text-center text-xs text-slate-500 ${status === "loading" ? "animate-pulse" : ""}`}
        >
          {message}
        </p>
      </div>
    );
  }

  const { metrics } = prepared.artifact.match;
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
          narration {percent(metrics.vttCoverage)} · book{" "}
          {percent(metrics.epubCoverage)} · {metrics.spanCount} spans ·{" "}
          {metrics.gapCount} gaps
        </span>
        {prepared.artifact.source.vttTiming === "interpolated" && (
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
                    prepared={prepared}
                    cueIndex={row.cueIndex}
                    isActive={row.cueIndex === activeCueIndex}
                    activeTokenSeq={activeTokenSeq}
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

/** One cue segment: either unstyled text between tokens (whitespace,
 * punctuation) or a token slice eligible for match/unmatched/active styling.
 * Slicing the raw cue text this way (instead of re-joining decoded tokens
 * with inserted spaces) keeps punctuation intact in the rendered line. */
interface CueSegment {
  key: string;
  text: string;
  tokenSeq: number | null;
}

function buildCueSegments(
  prepared: PreparedAlignment,
  cueIndex: number,
): Array<CueSegment> {
  const { artifact, cueTokenStart, cueTokenCount } = prepared;
  const { vtt } = artifact;
  const text = vtt.cues.text[cueIndex] ?? "";
  const tokenStart = cueTokenStart[cueIndex] ?? -1;
  const tokenCount = cueTokenCount[cueIndex] ?? 0;

  if (tokenCount <= 0 || tokenStart < 0) {
    return [{ key: "plain-0", text, tokenSeq: null }];
  }

  const segments: Array<CueSegment> = [];
  let cursor = 0;
  for (let k = 0; k < tokenCount; k++) {
    const seq = tokenStart + k;
    const charStart = vtt.tokens.charStart[seq] ?? cursor;
    const charEnd = vtt.tokens.charEnd[seq] ?? charStart;
    if (charStart > cursor) {
      segments.push({
        key: `gap-${seq}`,
        text: text.slice(cursor, charStart),
        tokenSeq: null,
      });
    }
    segments.push({
      key: `tok-${seq}`,
      text: text.slice(charStart, charEnd),
      tokenSeq: seq,
    });
    cursor = charEnd;
  }
  if (cursor < text.length) {
    segments.push({ key: "trail", text: text.slice(cursor), tokenSeq: null });
  }
  return segments;
}

function CueRow({
  prepared,
  cueIndex,
  isActive,
  activeTokenSeq,
  onSeek,
  onShowInBook,
}: {
  prepared: PreparedAlignment;
  cueIndex: number;
  isActive: boolean;
  activeTokenSeq: number;
  onSeek: (sec: number) => void;
  onShowInBook?: (token: ActiveTokenInfo) => void;
}) {
  const startSec = prepared.artifact.vtt.cues.startSec[cueIndex] ?? 0;
  const segments = useMemo(
    () => buildCueSegments(prepared, cueIndex),
    [prepared, cueIndex],
  );
  const hasTokens = (prepared.cueTokenCount[cueIndex] ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={() => onSeek(startSec)}
      className={`block w-full rounded px-2 py-0.5 text-left text-xs transition-colors ${
        isActive ? "bg-cyan-900/50" : "hover:bg-slate-800"
      }`}
    >
      <span className="mr-1.5 text-[10px] tabular-nums text-slate-600">
        {formatDuration(startSec)}
      </span>
      {segments.map((segment) => {
        if (segment.tokenSeq === null) {
          if (!hasTokens) {
            return (
              <span key={segment.key} className="text-rose-400/90">
                {segment.text}
              </span>
            );
          }
          return <span key={segment.key}>{segment.text}</span>;
        }
        const seq = segment.tokenSeq;
        const matched = (prepared.epubSeq[seq] ?? -1) >= 0;
        const isActiveToken = isActive && seq === activeTokenSeq;
        const canShowToken = onShowInBook !== undefined && matched;
        return (
          // One gesture per word (symmetric with the reader's dblclick
          // reverse-sync): a single click seeks to THAT word's time and,
          // when it's matched, also shows it in the book. The enclosing row
          // is already a <button> (cue-start seek), so these stay <span>s
          // with onClick+stopPropagation — nesting buttons would be invalid
          // interactive semantics.
          <span
            key={segment.key}
            className={`cursor-pointer ${
              isActiveToken
                ? "rounded-sm bg-cyan-400/30 text-white"
                : matched
                  ? isActive
                    ? "text-cyan-300"
                    : "text-slate-300"
                  : "text-rose-400/90"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              onSeek(prepared.tokenStart[seq] ?? startSec);
              if (canShowToken) {
                onShowInBook({
                  vttSeq: seq,
                  epubSeq: prepared.epubSeq[seq] ?? null,
                  raw: segment.text,
                });
              }
            }}
            title={`Play from this word${canShowToken ? " (shows in book)" : ""}`}
          >
            {segment.text}
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
