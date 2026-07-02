import { config } from "./config.ts";
import type { MatchedSpan, ResidualGap } from "./contracts.ts";
import { runExactPass } from "./exact-pass.ts";
import { extractEpub, type EpubExtraction } from "./epub-extract.ts";
import {
  computeMetrics,
  type AlignmentMetrics,
  type PassStats,
} from "./metrics.ts";
import { computeGaps, reconcile } from "./reconcile.ts";
import { buildVttSequence, type VttSequence } from "./vtt-sequence.ts";

/**
 * The per-book pipeline: sequences -> Pass 1 -> reconciliation -> gaps ->
 * metrics. Deterministic by construction (no wall-clock values enter the
 * result). Weaker passes run later inside the residual gaps via the same
 * reconciliation gate.
 */

export interface BookAlignment {
  vtt: VttSequence;
  epub: EpubExtraction;
  spans: MatchedSpan[];
  gaps: ResidualGap[];
  passes: PassStats[];
  metrics: AlignmentMetrics;
  warnings: string[];
}

export interface AlignOptions {
  /** Run the weaker gap-scoped proof pass after Pass 1 (default true). */
  proofPass?: boolean;
  /** Override the config extraction baseline (the linear="no" comparison). */
  includeNonLinearSpineItems?: boolean;
}

export async function alignBook(
  vttText: string,
  epubPath: string,
  options: AlignOptions = {},
): Promise<BookAlignment> {
  const vtt = buildVttSequence(vttText);
  const epub = await extractEpub(epubPath, {
    ...config.extraction,
    includeNonLinearSpineItems:
      options.includeNonLinearSpineItems ??
      config.extraction.includeNonLinearSpineItems,
  });

  const vttNorms = vtt.words.map((w) => w.norm);
  const epubNorms = epub.tokens.map((t) => t.norm);
  const bounds = { vttLength: vttNorms.length, epubLength: epubNorms.length };
  const warnings = [...vtt.warnings, ...epub.warnings];
  const passes: PassStats[] = [];

  // Pass 1: exact k-grams, globally unique, over the complete streams.
  const pass1Id = `pass1-exact-k${config.passes.pass1NgramSize}`;
  const pass1 = runExactPass(
    vttNorms,
    epubNorms,
    {
      passId: pass1Id,
      ngramSize: config.passes.pass1NgramSize,
      uniquenessScope: "global",
    },
    {
      vttStart: 0,
      vttEnd: bounds.vttLength,
      epubStart: 0,
      epubEnd: bounds.epubLength,
    },
  );
  const pass1Result = reconcile([], pass1.spans, bounds);
  collectRejections(pass1Result.rejected, warnings);
  let accepted = pass1Result.accepted;
  passes.push({
    passId: pass1Id,
    candidates: pass1.candidates,
    selected: pass1.selected,
    survivalRate: pass1.candidates > 0 ? pass1.selected / pass1.candidates : 1,
    acceptedSpans: accepted.length,
  });

  // Proof pass: smaller exact k-grams, uniqueness and LIS scoped to each
  // residual gap independently; may only add spans inside those gaps.
  if (options.proofPass !== false) {
    const proofId = `proof-exact-k${config.passes.proofNgramSize}`;
    let candidates = 0;
    let selected = 0;
    const proofSpans = computeGaps(accepted, bounds).flatMap((gap) => {
      const run = runExactPass(
        vttNorms,
        epubNorms,
        {
          passId: proofId,
          ngramSize: config.passes.proofNgramSize,
          uniquenessScope: "gap",
        },
        {
          vttStart: gap.vttStart,
          vttEnd: gap.vttEnd,
          epubStart: gap.epubStart,
          epubEnd: gap.epubEnd,
        },
      );
      candidates += run.candidates;
      selected += run.selected;
      return run.spans;
    });
    const proofResult = reconcile(accepted, proofSpans, bounds);
    collectRejections(proofResult.rejected, warnings);
    passes.push({
      passId: proofId,
      candidates,
      selected,
      survivalRate: candidates > 0 ? selected / candidates : 1,
      acceptedSpans: proofResult.accepted.length - accepted.length,
    });
    accepted = proofResult.accepted;
  }

  const gaps = computeGaps(accepted, bounds);
  const metrics = computeMetrics(
    vtt,
    epub,
    accepted,
    gaps,
    passes,
    config.metrics,
  );
  metrics.warnings.push(...warnings);

  return { vtt, epub, spans: accepted, gaps, passes, metrics, warnings };
}

function collectRejections(
  rejected: { span: MatchedSpan; reason: string }[],
  warnings: string[],
): void {
  for (const { span, reason } of rejected) {
    warnings.push(
      `reconciliation rejected ${span.passId} span vtt[${span.vttStart},${span.vttEnd}): ${reason}`,
    );
  }
}
