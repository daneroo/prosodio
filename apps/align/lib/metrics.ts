import type { MatchedSpan, ResidualGap } from "./contracts.ts";
import type { EpubExtraction } from "./epub-extract.ts";
import type { VttSequence } from "./vtt-sequence.ts";

/**
 * The raw evaluation vector (design: always report it; a composite score may
 * rank experiments but never replaces the measurements). Zero-match spine
 * documents stay in the primary coverage figure; anomalies feed a review
 * worklist, they do not prove anchors correct.
 */

export interface MetricsThresholds {
  lowMatchRatio: number;
  densityBucketMinutes: number;
  anomalyWpmMin: number;
  anomalyWpmMax: number;
  anomalyWordRatioMin: number;
  anomalyWordRatioMax: number;
  anomalyGapMinTokens: number;
}

export interface PassStats {
  passId: string;
  candidates: number;
  selected: number;
  /** selected / candidates; 1 when there were no candidates. */
  survivalRate: number;
  acceptedSpans: number;
}

export interface DistributionSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface SpineStats {
  spineIndex: number;
  spineHref: string;
  included: boolean;
  tokens: number;
  matchedTokens: number;
  matchRatio: number;
  anchorSpans: number;
  zeroMatch: boolean;
  lowMatch: boolean;
}

export interface GapAnomaly {
  gap: ResidualGap;
  seconds: number;
  impliedWpm: number | null;
  wordRatio: number | null;
  reasons: string[];
}

export interface DensityBucket {
  /** Bucket start in narration seconds. */
  startSec: number;
  anchorSpans: number;
}

export interface AlignmentMetrics {
  passes: PassStats[];
  vttTokens: number;
  epubTokens: number;
  vttMatchedTokens: number;
  epubMatchedTokens: number;
  /** Gross coverage — every extracted spine document included. */
  vttCoverage: number;
  epubCoverage: number;
  spanCount: number;
  gapCount: number;
  gapVttTokens: DistributionSummary;
  gapEpubTokens: DistributionSummary;
  gapSeconds: DistributionSummary;
  spines: SpineStats[];
  anchorDensity: DensityBucket[];
  anomalies: GapAnomaly[];
  warnings: string[];
}

export function computeMetrics(
  vtt: VttSequence,
  epub: EpubExtraction,
  spans: readonly MatchedSpan[],
  gaps: readonly ResidualGap[],
  passes: readonly PassStats[],
  thresholds: MetricsThresholds,
): AlignmentMetrics {
  const vttMatchedTokens = spans.reduce(
    (n, s) => n + (s.vttEnd - s.vttStart),
    0,
  );
  const epubMatchedTokens = spans.reduce(
    (n, s) => n + (s.epubEnd - s.epubStart),
    0,
  );

  const spines = computeSpineStats(epub, spans, thresholds);
  const warnings: string[] = [];
  for (const spine of spines) {
    if (!spine.included) continue;
    if (spine.zeroMatch) {
      warnings.push(
        `zero-match spine document: [${spine.spineIndex}] ${spine.spineHref} (${spine.tokens} tokens)`,
      );
    } else if (spine.lowMatch) {
      warnings.push(
        `low-match spine document: [${spine.spineIndex}] ${spine.spineHref} (ratio ${spine.matchRatio.toFixed(3)})`,
      );
    }
  }

  const timeOf = (seq: number): number =>
    seq >= vtt.words.length
      ? (vtt.words.at(-1)?.timeSec ?? 0)
      : (vtt.words[seq]?.timeSec ?? 0);
  const gapSecondsValues = gaps.map((g) =>
    Math.max(0, timeOf(g.vttEnd) - timeOf(g.vttStart)),
  );

  return {
    passes: [...passes],
    vttTokens: vtt.words.length,
    epubTokens: epub.tokens.length,
    vttMatchedTokens,
    epubMatchedTokens,
    vttCoverage: ratio(vttMatchedTokens, vtt.words.length),
    epubCoverage: ratio(epubMatchedTokens, epub.tokens.length),
    spanCount: spans.length,
    gapCount: gaps.length,
    gapVttTokens: summarize(gaps.map((g) => g.vttEnd - g.vttStart)),
    gapEpubTokens: summarize(gaps.map((g) => g.epubEnd - g.epubStart)),
    gapSeconds: summarize(gapSecondsValues),
    spines,
    anchorDensity: computeDensity(vtt, spans, thresholds),
    anomalies: computeAnomalies(gaps, gapSecondsValues, thresholds),
    warnings,
  };
}

function computeSpineStats(
  epub: EpubExtraction,
  spans: readonly MatchedSpan[],
  thresholds: MetricsThresholds,
): SpineStats[] {
  const matchedBySpine = new Map<number, number>();
  const anchorsBySpine = new Map<number, Set<number>>();
  spans.forEach((span, spanIndex) => {
    for (let seq = span.epubStart; seq < span.epubEnd; seq++) {
      const spineIndex = epub.tokens[seq]!.spineIndex;
      matchedBySpine.set(spineIndex, (matchedBySpine.get(spineIndex) ?? 0) + 1);
      let set = anchorsBySpine.get(spineIndex);
      if (!set) anchorsBySpine.set(spineIndex, (set = new Set()));
      set.add(spanIndex);
    }
  });
  return epub.spineDocs.map((doc) => {
    const tokens = doc.included ? doc.normalized.tokens.length : 0;
    const matchedTokens = matchedBySpine.get(doc.spineIndex) ?? 0;
    const matchRatio = ratio(matchedTokens, tokens);
    return {
      spineIndex: doc.spineIndex,
      spineHref: doc.spineHref,
      included: doc.included,
      tokens,
      matchedTokens,
      matchRatio,
      anchorSpans: anchorsBySpine.get(doc.spineIndex)?.size ?? 0,
      zeroMatch: doc.included && tokens > 0 && matchedTokens === 0,
      lowMatch:
        doc.included && tokens > 0 && matchRatio < thresholds.lowMatchRatio,
    };
  });
}

function computeDensity(
  vtt: VttSequence,
  spans: readonly MatchedSpan[],
  thresholds: MetricsThresholds,
): DensityBucket[] {
  const totalSec = vtt.words.at(-1)?.timeSec ?? 0;
  const bucketSec = thresholds.densityBucketMinutes * 60;
  if (totalSec <= 0 || bucketSec <= 0) return [];
  const buckets: DensityBucket[] = [];
  for (let startSec = 0; startSec <= totalSec; startSec += bucketSec) {
    buckets.push({ startSec, anchorSpans: 0 });
  }
  for (const span of spans) {
    const sec = vtt.words[span.vttStart]?.timeSec ?? 0;
    const bucket = buckets[Math.floor(sec / bucketSec)];
    if (bucket) bucket.anchorSpans += 1;
  }
  return buckets;
}

function computeAnomalies(
  gaps: readonly ResidualGap[],
  gapSeconds: readonly number[],
  thresholds: MetricsThresholds,
): GapAnomaly[] {
  const anomalies: GapAnomaly[] = [];
  gaps.forEach((gap, i) => {
    const vttTokens = gap.vttEnd - gap.vttStart;
    const epubTokens = gap.epubEnd - gap.epubStart;
    if (Math.max(vttTokens, epubTokens) < thresholds.anomalyGapMinTokens) {
      return;
    }
    const seconds = gapSeconds[i]!;
    const impliedWpm = seconds > 0 ? epubTokens / (seconds / 60) : null;
    const wordRatio = vttTokens > 0 ? epubTokens / vttTokens : null;
    const reasons: string[] = [];
    if (impliedWpm !== null && epubTokens > 0) {
      if (impliedWpm < thresholds.anomalyWpmMin) {
        reasons.push(
          `implied wpm ${impliedWpm.toFixed(0)} below ${thresholds.anomalyWpmMin}`,
        );
      } else if (impliedWpm > thresholds.anomalyWpmMax) {
        reasons.push(
          `implied wpm ${impliedWpm.toFixed(0)} above ${thresholds.anomalyWpmMax}`,
        );
      }
    }
    if (wordRatio !== null && epubTokens > 0) {
      if (wordRatio < thresholds.anomalyWordRatioMin) {
        reasons.push(
          `epub/vtt ratio ${wordRatio.toFixed(2)} below ${thresholds.anomalyWordRatioMin}`,
        );
      } else if (wordRatio > thresholds.anomalyWordRatioMax) {
        reasons.push(
          `epub/vtt ratio ${wordRatio.toFixed(2)} above ${thresholds.anomalyWordRatioMax}`,
        );
      }
    }
    if (vttTokens > 0 && epubTokens === 0) reasons.push("vtt-only gap");
    if (epubTokens > 0 && vttTokens === 0) reasons.push("epub-only gap");
    if (reasons.length > 0) {
      anomalies.push({ gap, seconds, impliedWpm, wordRatio, reasons });
    }
  });
  return anomalies;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function summarize(values: readonly number[]): DistributionSummary {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: sum / sorted.length,
    median: sorted[Math.floor(sorted.length / 2)]!,
  };
}
