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

export async function alignBook(
  vttText: string,
  epubPath: string,
): Promise<BookAlignment> {
  const vtt = buildVttSequence(vttText);
  const epub = await extractEpub(epubPath, config.extraction);

  const vttNorms = vtt.words.map((w) => w.norm);
  const epubNorms = epub.tokens.map((t) => t.norm);
  const bounds = { vttLength: vttNorms.length, epubLength: epubNorms.length };

  const pass1 = runExactPass(
    vttNorms,
    epubNorms,
    {
      passId: `pass1-exact-k${config.passes.pass1NgramSize}`,
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
  const { accepted, rejected } = reconcile([], pass1.spans, bounds);

  const warnings = [...vtt.warnings, ...epub.warnings];
  for (const { span, reason } of rejected) {
    warnings.push(
      `reconciliation rejected ${span.passId} span vtt[${span.vttStart},${span.vttEnd}): ${reason}`,
    );
  }

  const gaps = computeGaps(accepted, bounds);
  const passes: PassStats[] = [
    {
      passId: `pass1-exact-k${config.passes.pass1NgramSize}`,
      candidates: pass1.candidates,
      selected: pass1.selected,
      survivalRate:
        pass1.candidates > 0 ? pass1.selected / pass1.candidates : 1,
      acceptedSpans: accepted.length,
    },
  ];
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
