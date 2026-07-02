// The serialized alignment result — the single source of truth for what an
// alignment run produces on disk. Every TS type is inferred from its Zod
// schema (never hand-written in parallel); strictObject rejects undeclared
// fields. Determinism: no run-instant, hostname, or wall-clock value may
// appear here — the VTT provenance block is source data read from the input
// file, so identical inputs still serialize byte-identically.
import { z } from "zod";
import type { BookAlignment } from "./align-book.ts";
import { config } from "./config.ts";
import { resolveAddresses } from "./epub-extract.ts";

export const ALIGNMENT_RESULT_SCHEMA_VERSION = 1;

const epubTextAddressSchema = z.strictObject({
  spineIndex: z.number().int().nonnegative(),
  spineHref: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const spanEvidenceSchema = z.strictObject({
  kind: z.literal("exact-unique-ngram"),
  ngramSize: z.number().int().positive(),
  uniquenessScope: z.enum(["global", "gap"]),
  anchors: z.number().int().positive(),
  extendedLeft: z.number().int().nonnegative(),
  extendedRight: z.number().int().nonnegative(),
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

const gapSchema = z.strictObject({
  vttStart: z.number().int().nonnegative(),
  vttEnd: z.number().int().nonnegative(),
  epubStart: z.number().int().nonnegative(),
  epubEnd: z.number().int().nonnegative(),
});

const passStatsSchema = z.strictObject({
  passId: z.string(),
  candidates: z.number().int().nonnegative(),
  selected: z.number().int().nonnegative(),
  survivalRate: z.number(),
  acceptedSpans: z.number().int().nonnegative(),
});

const distributionSchema = z.strictObject({
  count: z.number().int().nonnegative(),
  min: z.number(),
  max: z.number(),
  mean: z.number(),
  median: z.number(),
});

const spineStatsSchema = z.strictObject({
  spineIndex: z.number().int().nonnegative(),
  spineHref: z.string(),
  included: z.boolean(),
  tokens: z.number().int().nonnegative(),
  matchedTokens: z.number().int().nonnegative(),
  matchRatio: z.number(),
  anchorSpans: z.number().int().nonnegative(),
  zeroMatch: z.boolean(),
  lowMatch: z.boolean(),
});

const anomalySchema = z.strictObject({
  gap: gapSchema,
  seconds: z.number(),
  impliedWpm: z.number().nullable(),
  wordRatio: z.number().nullable(),
  reasons: z.array(z.string()),
});

const densityBucketSchema = z.strictObject({
  startSec: z.number(),
  anchorSpans: z.number().int().nonnegative(),
});

const metricsSchema = z.strictObject({
  passes: z.array(passStatsSchema),
  vttTokens: z.number().int().nonnegative(),
  epubTokens: z.number().int().nonnegative(),
  vttMatchedTokens: z.number().int().nonnegative(),
  epubMatchedTokens: z.number().int().nonnegative(),
  vttCoverage: z.number(),
  epubCoverage: z.number(),
  spanCount: z.number().int().nonnegative(),
  gapCount: z.number().int().nonnegative(),
  gapVttTokens: distributionSchema,
  gapEpubTokens: distributionSchema,
  gapSeconds: distributionSchema,
  spines: z.array(spineStatsSchema),
  anchorDensity: z.array(densityBucketSchema),
  anomalies: z.array(anomalySchema),
  warnings: z.array(z.string()),
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
      parseMode: z.literal("text/html"),
    }),
  }),
  spans: z.array(spanSchema),
  gaps: z.array(gapSchema),
  metrics: metricsSchema,
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
    warnings: alignment.warnings,
  };
  return alignmentResultSchema.parse(result);
}
