// The CLI-owned book report projection: the private, human-reviewable JSON
// written into reports/ (see docs/PRIVACY.md). This schema lives in the app,
// not the package, because it carries filesystem paths and review-sample text
// extracts that never belong in the browser-served artifact
// (packages/align/src/artifact.ts). Every TS type is inferred from its Zod
// schema (never hand-written in parallel); strictObject rejects undeclared
// fields. Determinism: no run-instant, hostname, or wall-clock value may
// appear here — the VTT provenance block is source data read from the input
// file, so identical inputs still serialize byte-identically.
//
// NOTE (bookplayer-align-refine T5.1): packages/align/src/result.ts (the v1
// alignmentResultSchema/buildAlignmentResult, a near-duplicate of this
// schema/builder) was deleted once bookplayer cut over to the v2 artifact.
// This module is now the sole owner of the report shape.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  alignConfig,
  gapSchema,
  metricsSchema,
  resolveAddresses,
  spanEvidenceSchema,
  type BookAlignment,
} from "@prosodio/align";

export const BOOK_REPORT_SCHEMA_VERSION = 1;

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

export const bookReportSchema = z.strictObject({
  schemaVersion: z.literal(BOOK_REPORT_SCHEMA_VERSION),
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
      parseMode: z.literal("by-extension"),
    }),
  }),
  spans: z.array(spanSchema),
  gaps: z.array(gapSchema),
  metrics: metricsSchema,
  reviewSamples: z.array(reviewSampleSchema),
  warnings: z.array(z.string()),
});

export type BookReport = z.infer<typeof bookReportSchema>;

export interface ReportSource {
  root: string;
  base: string;
  vttPath: string;
  epubPath: string;
  m4bPath: string | null;
}

export function buildBookReport(
  alignment: BookAlignment,
  source: ReportSource,
): BookReport {
  const timeAt = (seq: number): number =>
    alignment.vtt.words[seq]?.timeSec ?? 0;
  const report: BookReport = {
    schemaVersion: BOOK_REPORT_SCHEMA_VERSION,
    source: {
      ...source,
      vttTiming: alignment.vtt.timing,
      vttProvenance: alignment.vtt.provenance
        ? { ...alignment.vtt.provenance }
        : null,
    },
    config: {
      normalizationPolicy: alignConfig.normalizationPolicy,
      pass1NgramSize: alignConfig.passes.pass1NgramSize,
      proofNgramSize: alignConfig.passes.proofNgramSize,
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
  return bookReportSchema.parse(report);
}

type ReviewSample = BookReport["reviewSamples"][number];

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

/**
 * Report writing into the private reports home (gitignored; see
 * docs/PRIVACY.md). The directory is a nested LOCAL-ONLY git repo — history
 * for regression comparison without publication (exemplar:
 * apps/epub-validate/reports/). Regeneration deletes stale generated files
 * but must always preserve the nested `.git`.
 */

/** Create the reports dir and its nested local-only git repo if missing. */
export function ensureReportsRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".git"))) {
    const init = Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
    if (init.exitCode !== 0) {
      throw new Error(`git init failed in ${dir}`);
    }
  }
}

/** Delete every report entry except the nested `.git` (full regeneration). */
export function cleanReports(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === ".git") continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

/** reports/<root>/<base>.alignment.json */
export function writeBookReport(dir: string, report: BookReport): string {
  const rootDir = join(dir, report.source.root);
  mkdirSync(rootDir, { recursive: true });
  const path = join(rootDir, `${report.source.base}.alignment.json`);
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

export interface RunSummaryBook {
  root: string;
  base: string;
  spans: number;
  vttCoverage: number;
  epubCoverage: number;
  anomalies: number;
  warnings: number;
}

export interface RunSummary {
  books: RunSummaryBook[];
  exclusions: { root: string; kind: string; base: string }[];
  search: string | null;
}

/** reports/summary.json — the run-level view (no wall-clock values). */
export function writeRunSummary(dir: string, summary: RunSummary): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "summary.json");
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`);
  return path;
}

export function summarizeBook(report: BookReport): RunSummaryBook {
  return {
    root: report.source.root,
    base: report.source.base,
    spans: report.spans.length,
    vttCoverage: report.metrics.vttCoverage,
    epubCoverage: report.metrics.epubCoverage,
    anomalies: report.metrics.anomalies.length,
    warnings: report.metrics.warnings.length,
  };
}
