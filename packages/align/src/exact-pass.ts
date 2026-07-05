import type { MatchedSpan } from "./contracts.ts";
import { longestIncreasingSubsequence } from "./lis.ts";

/**
 * The exact unique n-gram pass: candidates from n-grams occurring exactly
 * once in each stream (within the window), maximum-cardinality monotonic
 * selection via LIS, same-diagonal coalescing, then exact extension bounded
 * by neighbors. Pass 1 runs it over the complete streams (global uniqueness);
 * the multipass proof runs it per residual gap (gap-scoped uniqueness) — the
 * same protocol at both strengths.
 */

export interface ExactPassParams {
  passId: string;
  ngramSize: number;
  uniquenessScope: "global" | "gap";
}

/** Half-open token window the pass may read and match within. */
export interface PassWindow {
  vttStart: number;
  vttEnd: number;
  epubStart: number;
  epubEnd: number;
}

interface Candidate {
  vttOffset: number;
  epubOffset: number;
}

export interface ExactPassRun {
  spans: MatchedSpan[];
  /** Unique-in-both n-gram candidates before monotonic selection. */
  candidates: number;
  /** Candidates surviving LIS — the monotonic survival numerator. */
  selected: number;
}

export function runExactPass(
  vttNorms: readonly string[],
  epubNorms: readonly string[],
  params: ExactPassParams,
  window: PassWindow,
): ExactPassRun {
  const k = params.ngramSize;
  const candidates = uniqueNgramCandidates(vttNorms, epubNorms, k, window);
  const selected = selectMonotonic(candidates);
  const coalesced = trimOverlaps(coalesceDiagonalRuns(selected, k));
  extendSpans(coalesced, vttNorms, epubNorms, window);
  const spans = coalesced.map((span) => ({
    passId: params.passId,
    vttStart: span.vttStart,
    vttEnd: span.vttEnd,
    epubStart: span.epubStart,
    epubEnd: span.epubEnd,
    evidence: {
      kind: "exact-unique-ngram" as const,
      ngramSize: k,
      uniquenessScope: params.uniquenessScope,
      anchors: span.anchors,
      extendedLeft: span.extendedLeft,
      extendedRight: span.extendedRight,
    },
  }));
  return { spans, candidates: candidates.length, selected: selected.length };
}

/**
 * N-grams keyed by their joined token text — normalized tokens contain no
 * spaces, so the key equals the token array and no post-hash verification is
 * needed (the design's "verify on hash hit" holds by construction).
 */
function uniqueNgramCandidates(
  vttNorms: readonly string[],
  epubNorms: readonly string[],
  k: number,
  window: PassWindow,
): Candidate[] {
  const vttUnique = uniqueNgrams(vttNorms, k, window.vttStart, window.vttEnd);
  const epubUnique = uniqueNgrams(
    epubNorms,
    k,
    window.epubStart,
    window.epubEnd,
  );
  const candidates: Candidate[] = [];
  for (const [key, vttOffset] of vttUnique) {
    const epubOffset = epubUnique.get(key);
    if (epubOffset !== undefined) candidates.push({ vttOffset, epubOffset });
  }
  return candidates.sort((a, b) => a.vttOffset - b.vttOffset);
}

/** Offsets of n-grams occurring exactly once in [start, end). */
function uniqueNgrams(
  norms: readonly string[],
  k: number,
  start: number,
  end: number,
): Map<string, number> {
  const seen = new Map<string, number | null>(); // null = duplicate
  for (let i = start; i + k <= end; i++) {
    const key = norms.slice(i, i + k).join(" ");
    seen.set(key, seen.has(key) ? null : i);
  }
  const unique = new Map<string, number>();
  for (const [key, offset] of seen) {
    if (offset !== null) unique.set(key, offset);
  }
  return unique;
}

/** Maximum-cardinality monotonic chain: strictly increasing epubOffset. */
function selectMonotonic(candidates: Candidate[]): Candidate[] {
  const indices = longestIncreasingSubsequence(
    candidates.map((c) => c.epubOffset),
  );
  return indices.map((i) => candidates[i]!);
}

interface WorkingSpan {
  vttStart: number;
  vttEnd: number;
  epubStart: number;
  epubEnd: number;
  anchors: number;
  extendedLeft: number;
  extendedRight: number;
}

/**
 * Merge overlapping or adjacent candidates on the same VTT/EPUB diagonal into
 * exact spans; a diagonal break starts a new span.
 */
function coalesceDiagonalRuns(
  candidates: Candidate[],
  k: number,
): WorkingSpan[] {
  const spans: WorkingSpan[] = [];
  for (const candidate of candidates) {
    const last = spans.at(-1);
    const sameDiagonal =
      last &&
      candidate.vttOffset - candidate.epubOffset ===
        last.vttStart - last.epubStart;
    if (sameDiagonal && candidate.vttOffset <= last.vttEnd) {
      last.vttEnd = Math.max(last.vttEnd, candidate.vttOffset + k);
      last.epubEnd = Math.max(last.epubEnd, candidate.epubOffset + k);
      last.anchors += 1;
    } else {
      spans.push({
        vttStart: candidate.vttOffset,
        vttEnd: candidate.vttOffset + k,
        epubStart: candidate.epubOffset,
        epubEnd: candidate.epubOffset + k,
        anchors: 1,
        extendedLeft: 0,
        extendedRight: 0,
      });
    }
  }
  return spans;
}

/**
 * LIS guarantees strictly increasing offsets, but consecutive spans on
 * different diagonals can still overlap by up to k-1 tokens (a candidate may
 * start less than k after its predecessor). Trim the later span's start
 * equally on both axes — it stays exact on its diagonal — and drop spans a
 * trim fully absorbs, so the pass emits ordered non-overlapping spans.
 */
function trimOverlaps(spans: WorkingSpan[]): WorkingSpan[] {
  const result: WorkingSpan[] = [];
  for (const span of spans) {
    const prev = result.at(-1);
    if (prev) {
      const overlap = Math.max(
        prev.vttEnd - span.vttStart,
        prev.epubEnd - span.epubStart,
        0,
      );
      if (overlap > 0) {
        span.vttStart += overlap;
        span.epubStart += overlap;
        if (span.vttStart >= span.vttEnd || span.epubStart >= span.epubEnd) {
          continue;
        }
      }
    }
    result.push(span);
  }
  return result;
}

/**
 * Extend each span outward while normalized tokens match exactly, bounded by
 * the window and by neighboring spans on both axes; merge neighbors whose
 * extensions meet with no mismatch (same diagonal, touching on both axes).
 */
function extendSpans(
  spans: WorkingSpan[],
  vttNorms: readonly string[],
  epubNorms: readonly string[],
  window: PassWindow,
): void {
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    const prev = spans[i - 1];
    const next = spans[i + 1];
    const vttLow = prev ? prev.vttEnd : window.vttStart;
    const epubLow = prev ? prev.epubEnd : window.epubStart;
    const vttHigh = next ? next.vttStart : window.vttEnd;
    const epubHigh = next ? next.epubStart : window.epubEnd;
    while (
      span.vttStart > vttLow &&
      span.epubStart > epubLow &&
      vttNorms[span.vttStart - 1] === epubNorms[span.epubStart - 1]
    ) {
      span.vttStart--;
      span.epubStart--;
      span.extendedLeft++;
    }
    while (
      span.vttEnd < vttHigh &&
      span.epubEnd < epubHigh &&
      vttNorms[span.vttEnd] === epubNorms[span.epubEnd]
    ) {
      span.vttEnd++;
      span.epubEnd++;
      span.extendedRight++;
    }
    // Merge with the previous span when the gap closed on both axes with no
    // mismatch — only possible on the same diagonal.
    if (
      prev &&
      span.vttStart === prev.vttEnd &&
      span.epubStart === prev.epubEnd
    ) {
      prev.vttEnd = span.vttEnd;
      prev.epubEnd = span.epubEnd;
      prev.anchors += span.anchors;
      prev.extendedRight += span.extendedLeft + span.extendedRight;
      spans.splice(i, 1);
      i--;
    }
  }
}
