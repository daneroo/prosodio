/**
 * Browser-safe derive helpers over AlignmentArtifact (design D4 / plan T1.3):
 * per-token times, epub sequence numbers, per-cue aggregates, active-token
 * lookup, and the two point-read accessors (epub locator, raw token text).
 * Nothing here is stored on the wire — the artifact carries only the columns
 * these helpers read; every value below is recomputed client-side in one
 * derive pass (see apps/bookplayer/src/lib/alignment-client.ts, T4.1).
 *
 * No zod, server-side DOM library, or JS-runtime-builtin imports: this module
 * ships in the bookplayer client bundle (re-exported from browser.ts)
 * alongside the server-only package root. Types come from artifact.ts via
 * `import type` only, so zod's runtime never enters the browser graph through
 * this file.
 */
import { interpolateWordTimes } from "./cue-times.ts";
import type { AlignmentArtifact } from "./artifact.ts";
import type { DomTokenLocator } from "./epub-dom-path.ts";

/**
 * Run the callback once per contiguous run of tokens sharing a cue. Relies on
 * the artifact invariant that vtt.tokens.cueIndex is non-decreasing, so each
 * cue's tokens are a single contiguous slice — one linear pass suffices for
 * every per-cue derive below (deriveTokenTimes, deriveTokenEndTimes,
 * deriveCueAggregates).
 */
function forEachCueRun(
  cueIndex: ReadonlyArray<number>,
  onRun: (cue: number, start: number, end: number) => void,
): void {
  let runStart = 0;
  for (let i = 1; i <= cueIndex.length; i++) {
    if (i === cueIndex.length || cueIndex[i] !== cueIndex[runStart]) {
      onRun(cueIndex[runStart]!, runStart, i);
      runStart = i;
    }
  }
}

/**
 * Per-token start time. "word" timing: every token in a cue starts at the
 * cue's startSec (the engine has no sub-cue timestamps in this mode — see the
 * Codex #6 collapse test in artifact-derive.test.ts). "interpolated": tokens
 * are spread evenly across the cue via interpolateWordTimes, the same formula
 * the engine used to build the artifact's vttTiming (cue-times.ts).
 */
export function deriveTokenTimes(
  vtt: AlignmentArtifact["vtt"],
  timing: "word" | "interpolated",
): number[] {
  const { cueIndex } = vtt.tokens;
  const times = new Array<number>(cueIndex.length);
  if (timing === "word") {
    for (let i = 0; i < cueIndex.length; i++) {
      times[i] = vtt.cues.startSec[cueIndex[i]!]!;
    }
    return times;
  }
  forEachCueRun(cueIndex, (cue, start, end) => {
    const cueTimes = interpolateWordTimes(
      vtt.cues.startSec[cue]!,
      vtt.cues.endSec[cue]!,
      end - start,
    );
    for (let j = start; j < end; j++) times[j] = cueTimes[j - start]!;
  });
  return times;
}

/**
 * Per-token end time, ported verbatim from joinAlignedCues in the deleted
 * apps/bookplayer/src/lib/alignment.ts: a token ends where the next token in
 * the same cue starts; the last token in a cue ends at the cue's endSec.
 * Math.max guards non-monotonic interpolation (e.g. the word-timing collapse, where
 * every token in a cue shares one start) so every derived interval stays
 * non-empty on the low end (start <= end), even though it may be zero-width.
 */
export function deriveTokenEndTimes(
  times: number[],
  vtt: AlignmentArtifact["vtt"],
): number[] {
  const { cueIndex } = vtt.tokens;
  const endTimes = new Array<number>(times.length);
  forEachCueRun(cueIndex, (cue, start, end) => {
    const cueEnd = vtt.cues.endSec[cue]!;
    for (let j = start; j < end; j++) {
      const nextStart = j + 1 < end ? times[j + 1]! : cueEnd;
      endTimes[j] = Math.max(nextStart, times[j]!);
    }
  });
  return endTimes;
}

/**
 * Flat VTT seq -> flat EPUB seq, -1 where unmatched. Spans are guaranteed
 * non-empty, equal-width, in-bounds, and non-overlapping by the artifact
 * schema (Codex review #3), so a matched seq always resolves to
 * `epubStart + (seq - vttStart)` within its span.
 */
export function deriveEpubSeq(
  spans: AlignmentArtifact["match"]["spans"],
  vttTokenCount: number,
): number[] {
  const epubSeq = new Array<number>(vttTokenCount).fill(-1);
  for (const span of spans) {
    for (let seq = span.vttStart; seq < span.vttEnd; seq++) {
      epubSeq[seq] = span.epubStart + (seq - span.vttStart);
    }
  }
  return epubSeq;
}

export interface CueAggregates {
  /** Matched-token fraction per cue; 0 for a cue with zero tokens. */
  matchedRatio: number[];
  /** EPUB tokens skipped by a gap, attributed to the preceding cue. */
  gapEpubTokens: number[];
  /** Gap EPUB tokens with no preceding word (gap at the stream start). */
  leadingGapEpubTokens: number;
}

/**
 * Per-cue matched ratio and gap-token attribution, ported verbatim from the
 * deleted alignment.ts's joinAlignedCues: each gap's epub token count is
 * charged to the cue holding the last VTT word before the gap
 * (`cueIndex[gap.vttStart - 1]`); a gap at
 * the very start of the stream (vttStart 0, so `vttStart - 1` indexes
 * nothing) has no preceding cue and becomes the leading marker instead.
 */
export function deriveCueAggregates(
  vtt: AlignmentArtifact["vtt"],
  epubSeq: number[],
  gaps: AlignmentArtifact["match"]["gaps"],
): CueAggregates {
  const cueCount = vtt.cues.startSec.length;
  const matchedRatio = new Array<number>(cueCount).fill(0);
  const gapEpubTokens = new Array<number>(cueCount).fill(0);
  let leadingGapEpubTokens = 0;

  const { cueIndex } = vtt.tokens;
  forEachCueRun(cueIndex, (cue, start, end) => {
    let matched = 0;
    for (let j = start; j < end; j++) {
      if (epubSeq[j] !== -1) matched++;
    }
    const count = end - start;
    matchedRatio[cue] = count > 0 ? matched / count : 0;
  });

  for (const gap of gaps) {
    const epubTokens = gap.epubEnd - gap.epubStart;
    if (epubTokens <= 0) continue;
    const beforeCue = cueIndex[gap.vttStart - 1];
    if (beforeCue === undefined) {
      leadingGapEpubTokens += epubTokens;
      continue;
    }
    gapEpubTokens[beforeCue] = (gapEpubTokens[beforeCue] ?? 0) + epubTokens;
  }

  return { matchedRatio, gapEpubTokens, leadingGapEpubTokens };
}

/**
 * Binary search over sorted half-open [start, end) intervals for the one
 * containing t, else -1. Same contract as apps/bookplayer/src/lib/cues.ts
 * activeIntervalIndex, generalized to parallel columns instead of an array of
 * {startSec, endSec} objects: find the last interval whose start is <= t,
 * then confirm t hasn't already passed its end.
 */
export function activeTokenAt(
  startTimes: number[],
  endTimes: number[],
  t: number,
): number {
  let lo = 0;
  let hi = startTimes.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const start = startTimes[mid];
    if (start === undefined) break;
    if (start <= t) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate < 0) return -1;
  const end = endTimes[candidate];
  return end !== undefined && end > t ? candidate : -1;
}

export interface EpubTokenLocation {
  spineHref: string;
  // Derived from the artifact's own spine row type (not hand-duplicated) so
  // this never drifts from artifact.ts's parseMode enum (design D10 / H1/H2).
  parseMode: AlignmentArtifact["epub"]["spines"][number]["parseMode"];
  segPaths: number[][];
  segTextLen: number[];
  loc: DomTokenLocator;
}

/**
 * Bounds-checked point read of one EPUB token's DOM locator plus the spine
 * section it belongs to. The spiritual successor of epubTokenLocator from
 * the deleted apps/bookplayer/src/lib/epub-locator.ts, against the columnar
 * artifact instead of a base64-encoded typed-array index: null for any
 * non-integer, negative, or out-of-range epubSeq, or a spineIndex the
 * artifact doesn't carry (defensive; the schema already guarantees
 * in-range spineIndex).
 */
export function epubLocatorAt(
  epub: AlignmentArtifact["epub"],
  epubSeq: number,
): EpubTokenLocation | null {
  const { tokens } = epub;
  if (
    !Number.isInteger(epubSeq) ||
    epubSeq < 0 ||
    epubSeq >= tokens.spineIndex.length
  ) {
    return null;
  }
  const spineIndex = tokens.spineIndex[epubSeq]!;
  const spine = epub.spines[spineIndex];
  if (!spine) return null;
  const startSeg = tokens.startSeg[epubSeq];
  const startOffset = tokens.startOffset[epubSeq];
  const endSeg = tokens.endSeg[epubSeq];
  const endOffset = tokens.endOffset[epubSeq];
  if (
    startSeg === undefined ||
    startOffset === undefined ||
    endSeg === undefined ||
    endOffset === undefined
  ) {
    return null;
  }
  return {
    spineHref: spine.href,
    parseMode: spine.parseMode,
    segPaths: spine.segPaths,
    segTextLen: spine.segTextLen,
    loc: { startSeg, startOffset, endSeg, endOffset },
  };
}

/** A VTT token's raw text, sliced from its cue's shared text column. Empty
 * string for an out-of-range seq (never throws). */
export function tokenRaw(vtt: AlignmentArtifact["vtt"], seq: number): string {
  const cueIndex = vtt.tokens.cueIndex[seq];
  const charStart = vtt.tokens.charStart[seq];
  const charEnd = vtt.tokens.charEnd[seq];
  if (
    cueIndex === undefined ||
    charStart === undefined ||
    charEnd === undefined
  ) {
    return "";
  }
  const text = vtt.cues.text[cueIndex];
  return text === undefined ? "" : text.slice(charStart, charEnd);
}
