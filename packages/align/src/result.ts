// The serialized alignment result (v1) — the single source of truth for what
// an alignment run produces on disk. Every TS type is inferred from its Zod
// schema (never hand-written in parallel); strictObject rejects undeclared
// fields. Determinism: no run-instant, hostname, or wall-clock value may
// appear here — the VTT provenance block is source data read from the input
// file, so identical inputs still serialize byte-identically.
//
// NOTE (bookplayer-align-refine T2.1): this module is kept alive ONLY because
// apps/bookplayer/src/lib/alignment.ts still calls buildAlignmentResult at
// runtime (its compute path hasn't cut over to the v2 artifact yet). The CLI
// (apps/align) no longer uses this file — its report projection moved to
// apps/align/lib/report.ts (bookReportSchema/buildBookReport), which is a
// near-duplicate of the schema/builder below. The duplication is intentional
// and short-lived: Phase 5 deletes this file once bookplayer moves off it.
import { z } from "zod";
import type { BookAlignment } from "./align-book.ts";
import { gapSchema, metricsSchema, spanEvidenceSchema } from "./artifact.ts";
import { config } from "./config.ts";
import { resolveAddresses } from "./epub-extract.ts";

export const ALIGNMENT_RESULT_SCHEMA_VERSION = 1;

const epubTextAddressSchema = z.strictObject({
  spineIndex: z.number().int().nonnegative(),
  spineHref: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const spanSchema = z.strictObject({
  passId: z.string(),
  vttStart: z.number().int().nonnegative(),
  vttEnd: z.number().int().nonnegative(),
  epubStart: z.number().int().nonnegative(),
  epubEnd: z.number().int().nonnegative(),
  // Approximate narration time range (interpolated when the VTT lacks word
  // timestamps); ordering evidence, never matching evidence.
  vttStartSec: z.number(),
  vttEndSec: z.number(),
  // One address per spine document the span touches.
  addresses: z.array(epubTextAddressSchema).min(1),
  evidence: spanEvidenceSchema,
});

// Stratified manual-review sample: enough raw text and timing to check one
// anchor against the narration and the book without reopening either. The
// review procedure and its reason codes live in the app README.
const reviewSampleSchema = z.strictObject({
  stratum: z.enum(["edge-first", "edge-last", "interior", "anomaly-adjacent"]),
  passId: z.string(),
  vttStart: z.number().int().nonnegative(),
  vttStartSec: z.number(),
  vttText: z.string(),
  epubText: z.string(),
  address: epubTextAddressSchema,
});

export const alignmentResultSchema = z.strictObject({
  schemaVersion: z.literal(ALIGNMENT_RESULT_SCHEMA_VERSION),
  source: z.strictObject({
    root: z.string(),
    base: z.string(),
    vttPath: z.string(),
    epubPath: z.string(),
    m4bPath: z.string().nullable(),
    vttTiming: z.enum(["word", "interpolated"]),
    // The VTT header provenance block as parsed from the source file.
    vttProvenance: z.record(z.string(), z.unknown()).nullable(),
  }),
  config: z.strictObject({
    normalizationPolicy: z.string(),
    pass1NgramSize: z.number().int().positive(),
    proofNgramSize: z.number().int().positive(),
    extraction: z.strictObject({
      includeNonLinearSpineItems: z.boolean(),
      excludedElements: z.array(z.string()),
      domParser: z.literal("jsdom"),
      parseMode: z.literal("xhtml-or-html-fallback"),
    }),
  }),
  spans: z.array(spanSchema),
  gaps: z.array(gapSchema),
  metrics: metricsSchema,
  reviewSamples: z.array(reviewSampleSchema),
  warnings: z.array(z.string()),
});

export type AlignmentResult = z.infer<typeof alignmentResultSchema>;

export interface ResultSource {
  root: string;
  base: string;
  vttPath: string;
  epubPath: string;
  m4bPath: string | null;
}

export function buildAlignmentResult(
  alignment: BookAlignment,
  source: ResultSource,
): AlignmentResult {
  const timeAt = (seq: number): number =>
    alignment.vtt.words[seq]?.timeSec ?? 0;
  const result: AlignmentResult = {
    schemaVersion: ALIGNMENT_RESULT_SCHEMA_VERSION,
    source: {
      ...source,
      vttTiming: alignment.vtt.timing,
      vttProvenance: alignment.vtt.provenance
        ? { ...alignment.vtt.provenance }
        : null,
    },
    config: {
      normalizationPolicy: config.normalizationPolicy,
      pass1NgramSize: config.passes.pass1NgramSize,
      proofNgramSize: config.passes.proofNgramSize,
      extraction: {
        includeNonLinearSpineItems:
          alignment.epub.config.includeNonLinearSpineItems,
        excludedElements: [...alignment.epub.config.excludedElements],
        domParser: alignment.epub.config.domParser,
        parseMode: alignment.epub.config.parseMode,
      },
    },
    spans: alignment.spans.map((span) => ({
      passId: span.passId,
      vttStart: span.vttStart,
      vttEnd: span.vttEnd,
      epubStart: span.epubStart,
      epubEnd: span.epubEnd,
      vttStartSec: timeAt(span.vttStart),
      vttEndSec: timeAt(span.vttEnd - 1),
      addresses: resolveAddresses(alignment.epub, span.epubStart, span.epubEnd),
      evidence: span.evidence,
    })),
    gaps: alignment.gaps.map((gap) => ({ ...gap })),
    metrics: alignment.metrics,
    reviewSamples: sampleForReview(alignment),
    warnings: alignment.warnings,
  };
  return alignmentResultSchema.parse(result);
}

type ReviewSample = AlignmentResult["reviewSamples"][number];

const REVIEW_TEXT_TOKENS = 30;

/**
 * Deterministic stratified sample: both edges, the interior median span, and
 * the span following each of the first three anomalous gaps. At least one
 * sample exists whenever any span was accepted.
 */
function sampleForReview(alignment: BookAlignment): ReviewSample[] {
  const spans = alignment.spans;
  if (spans.length === 0) return [];
  const picks = new Map<number, ReviewSample["stratum"]>();
  const pick = (index: number, stratum: ReviewSample["stratum"]) => {
    if (index >= 0 && index < spans.length && !picks.has(index)) {
      picks.set(index, stratum);
    }
  };
  pick(0, "edge-first");
  pick(spans.length - 1, "edge-last");
  pick(Math.floor(spans.length / 2), "interior");
  for (const anomaly of alignment.metrics.anomalies.slice(0, 3)) {
    const following = spans.findIndex((s) => s.vttStart >= anomaly.gap.vttEnd);
    pick(following, "anomaly-adjacent");
  }
  return [...picks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, stratum]) => toReviewSample(alignment, index, stratum));
}

function toReviewSample(
  alignment: BookAlignment,
  spanIndex: number,
  stratum: ReviewSample["stratum"],
): ReviewSample {
  const span = alignment.spans[spanIndex]!;
  const vttEnd = Math.min(span.vttEnd, span.vttStart + REVIEW_TEXT_TOKENS);
  const epubEnd = Math.min(span.epubEnd, span.epubStart + REVIEW_TEXT_TOKENS);
  const vttText = alignment.vtt.words
    .slice(span.vttStart, vttEnd)
    .map((w) => w.raw)
    .join(" ");
  const [address] = resolveAddresses(alignment.epub, span.epubStart, epubEnd);
  const firstToken = alignment.epub.tokens[span.epubStart]!;
  const lastToken = alignment.epub.tokens[epubEnd - 1]!;
  const doc = alignment.epub.spineDocs[firstToken.spineIndex]!;
  // Raw slice only when the sample stays inside one spine document; the
  // normalized stream is the fallback across a boundary.
  const epubText =
    lastToken.spineIndex === firstToken.spineIndex
      ? doc.visibleText
          .slice(
            doc.normalized.tokens[firstToken.tokenIndex]!.rawStart,
            doc.normalized.tokens[lastToken.tokenIndex]!.rawEnd,
          )
          .replace(/\s+/g, " ")
          .trim()
      : alignment.epub.tokens
          .slice(span.epubStart, epubEnd)
          .map((t) => t.norm)
          .join(" ");
  return {
    stratum,
    passId: span.passId,
    vttStart: span.vttStart,
    vttStartSec: alignment.vtt.words[span.vttStart]!.timeSec,
    vttText,
    epubText,
    address: address!,
  };
}
