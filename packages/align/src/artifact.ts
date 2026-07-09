// The versioned columnar alignment artifact — the single wire/cache format
// consumed by the CLI report projection, the bookplayer server cache, and the
// browser client. Every TS type is inferred from its Zod schema (never
// hand-written in parallel); strictObject rejects undeclared fields.
// Determinism: no run-instant, hostname, or wall-clock value may appear here
// — the VTT provenance block is source data read from the input file, so
// identical inputs still serialize byte-identically.
//
// Wire principle (design D4): row objects only for small tables (spans,
// gaps, spines, metrics); plain parallel JSON `number[]` columns for cue- and
// token-scale data. No base64, no typed arrays on the wire.
import { z } from "zod";
import type { BookAlignment } from "./align-book.ts";
import { config } from "./config.ts";

export const ALIGNMENT_ARTIFACT_SCHEMA_VERSION = 2;

export const spanEvidenceSchema = z.strictObject({
  kind: z.literal("exact-unique-ngram"),
  ngramSize: z.number().int().positive(),
  uniquenessScope: z.enum(["global", "gap"]),
  anchors: z.number().int().positive(),
  extendedLeft: z.number().int().nonnegative(),
  extendedRight: z.number().int().nonnegative(),
});

export const gapSchema = z.strictObject({
  vttStart: z.number().int().nonnegative(),
  vttEnd: z.number().int().nonnegative(),
  epubStart: z.number().int().nonnegative(),
  epubEnd: z.number().int().nonnegative(),
});

export const passStatsSchema = z.strictObject({
  passId: z.string(),
  candidates: z.number().int().nonnegative(),
  selected: z.number().int().nonnegative(),
  survivalRate: z.number(),
  acceptedSpans: z.number().int().nonnegative(),
});

export const distributionSchema = z.strictObject({
  count: z.number().int().nonnegative(),
  min: z.number(),
  max: z.number(),
  mean: z.number(),
  median: z.number(),
});

export const spineStatsSchema = z.strictObject({
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

export const anomalySchema = z.strictObject({
  gap: gapSchema,
  seconds: z.number(),
  impliedWpm: z.number().nullable(),
  wordRatio: z.number().nullable(),
  reasons: z.array(z.string()),
});

export const densityBucketSchema = z.strictObject({
  startSec: z.number(),
  anchorSpans: z.number().int().nonnegative(),
});

export const metricsSchema = z.strictObject({
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

const spanSchema = z.strictObject({
  passId: z.string(),
  // Half-open flat-token ranges, both sides.
  vttStart: z.number().int().nonnegative(),
  vttEnd: z.number().int().nonnegative(),
  epubStart: z.number().int().nonnegative(),
  epubEnd: z.number().int().nonnegative(),
  evidence: spanEvidenceSchema,
});

const spineSchema = z.strictObject({
  href: z.string(),
  // Which parser produced this section's tree server-side (design D10).
  // epub.js picks by extension; a mismatch predicts parity failure.
  parseMode: z.enum(["xhtml", "html-fallback"]),
  segPaths: z.array(z.array(z.number().int().nonnegative())),
  segTextLen: z.array(z.number().int().nonnegative()),
});

function columnLengthIssue(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  name: string,
  expected: number,
  actual: number,
) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: `${name} length ${actual} does not match expected ${expected}`,
  });
}

export const alignmentArtifactSchema = z
  .strictObject({
    schemaVersion: z.literal(ALIGNMENT_ARTIFACT_SCHEMA_VERSION),
    // Reserved for future packed-column codecs (design D4); empty for now.
    features: z.array(z.string()),
    // Public, browser-served block (Codex review #1): no filesystem paths.
    // `root` is the root NAME (e.g. "fixtures" | "private"), not a directory.
    // Absolute paths (vttPath/epubPath/m4bPath) live only in the server cache
    // sidecar and the local CLI report projection (result.ts's
    // ResultSource); they never reach this artifact.
    source: z.strictObject({
      root: z.string(),
      base: z.string(),
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
    match: z.strictObject({
      spans: z.array(spanSchema),
      gaps: z.array(gapSchema),
      metrics: metricsSchema,
    }),
    vtt: z.strictObject({
      cues: z.strictObject({
        // Parallel by cue index; seconds rounded to ms at build.
        startSec: z.array(z.number()),
        endSec: z.array(z.number()),
        // Raw cue text, shipped once; tokens slice into it.
        text: z.array(z.string()),
      }),
      tokens: z.strictObject({
        // Parallel by flat VTT token seq.
        cueIndex: z.array(z.number().int().nonnegative()),
        // Half-open range into cues.text[cueIndex[i]].
        charStart: z.array(z.number().int().nonnegative()),
        charEnd: z.array(z.number().int().nonnegative()),
      }),
    }),
    epub: z.strictObject({
      spines: z.array(spineSchema),
      tokens: z.strictObject({
        // Parallel by flat EPUB token seq.
        spineIndex: z.array(z.number().int().nonnegative()),
        startSeg: z.array(z.number().int().nonnegative()),
        startOffset: z.array(z.number().int().nonnegative()),
        endSeg: z.array(z.number().int().nonnegative()),
        endOffset: z.array(z.number().int().nonnegative()),
      }),
    }),
  })
  .superRefine((artifact, ctx) => {
    const { cues, tokens: vttTokens } = artifact.vtt;
    if (cues.endSec.length !== cues.startSec.length) {
      columnLengthIssue(
        ctx,
        ["vtt", "cues", "endSec"],
        "vtt.cues.endSec",
        cues.startSec.length,
        cues.endSec.length,
      );
    }
    if (cues.text.length !== cues.startSec.length) {
      columnLengthIssue(
        ctx,
        ["vtt", "cues", "text"],
        "vtt.cues.text",
        cues.startSec.length,
        cues.text.length,
      );
    }
    const vttTokenLen = vttTokens.cueIndex.length;
    if (vttTokens.charStart.length !== vttTokenLen) {
      columnLengthIssue(
        ctx,
        ["vtt", "tokens", "charStart"],
        "vtt.tokens.charStart",
        vttTokenLen,
        vttTokens.charStart.length,
      );
    }
    if (vttTokens.charEnd.length !== vttTokenLen) {
      columnLengthIssue(
        ctx,
        ["vtt", "tokens", "charEnd"],
        "vtt.tokens.charEnd",
        vttTokenLen,
        vttTokens.charEnd.length,
      );
    }
    let lastCueIndex = -1;
    vttTokens.cueIndex.forEach((cueIndex, i) => {
      if (cueIndex < lastCueIndex) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vtt", "tokens", "cueIndex", i],
          message: `vtt.tokens.cueIndex must be non-decreasing: index ${i} value ${cueIndex} follows ${lastCueIndex}`,
        });
      }
      if (cueIndex < 0 || cueIndex >= cues.startSec.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vtt", "tokens", "cueIndex", i],
          message: `vtt.tokens.cueIndex[${i}] = ${cueIndex} out of range for ${cues.startSec.length} cues`,
        });
      }
      lastCueIndex = cueIndex;
    });

    for (const [i, spine] of artifact.epub.spines.entries()) {
      if (spine.segTextLen.length !== spine.segPaths.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["epub", "spines", i, "segTextLen"],
          message: `epub.spines[${i}].segTextLen length ${spine.segTextLen.length} does not match segPaths length ${spine.segPaths.length}`,
        });
      }
    }

    const epubTokens = artifact.epub.tokens;
    const epubTokenLen = epubTokens.spineIndex.length;
    const epubColumns: Array<[string, number[]]> = [
      ["startSeg", epubTokens.startSeg],
      ["startOffset", epubTokens.startOffset],
      ["endSeg", epubTokens.endSeg],
      ["endOffset", epubTokens.endOffset],
    ];
    for (const [name, column] of epubColumns) {
      if (column.length !== epubTokenLen) {
        columnLengthIssue(
          ctx,
          ["epub", "tokens", name],
          `epub.tokens.${name}`,
          epubTokenLen,
          column.length,
        );
      }
    }
    let lastSpineIndex = -1;
    epubTokens.spineIndex.forEach((spineIndex, i) => {
      if (spineIndex < lastSpineIndex) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["epub", "tokens", "spineIndex", i],
          message: `epub.tokens.spineIndex must be non-decreasing: index ${i} value ${spineIndex} follows ${lastSpineIndex}`,
        });
      }
      if (spineIndex < 0 || spineIndex >= artifact.epub.spines.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["epub", "tokens", "spineIndex", i],
          message: `epub.tokens.spineIndex[${i}] = ${spineIndex} out of range for ${artifact.epub.spines.length} spines`,
        });
      }
      lastSpineIndex = spineIndex;
    });

    // Span invariants (Codex review #3): deriveEpubSeq computes
    // `epubStart + (seq - vttStart)`, which is only correct when every span
    // is non-empty, equal-width, in bounds, and spans don't overlap on
    // either axis. A malformed span here would silently mislocate EPUB
    // positions downstream, so these are enforced at the artifact boundary
    // rather than left to callers.
    let lastSpan: (typeof artifact.match.spans)[number] | undefined;
    artifact.match.spans.forEach((span, i) => {
      if (span.vttEnd <= span.vttStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["match", "spans", i, "vttEnd"],
          message: `match.spans[${i}] vtt range is empty: vttStart=${span.vttStart} vttEnd=${span.vttEnd}`,
        });
      }
      if (span.epubEnd <= span.epubStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["match", "spans", i, "epubEnd"],
          message: `match.spans[${i}] epub range is empty: epubStart=${span.epubStart} epubEnd=${span.epubEnd}`,
        });
      }
      const vttWidth = span.vttEnd - span.vttStart;
      const epubWidth = span.epubEnd - span.epubStart;
      if (vttWidth !== epubWidth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["match", "spans", i],
          message: `match.spans[${i}] width mismatch: vtt width ${vttWidth} !== epub width ${epubWidth} (deriveEpubSeq requires equal-width spans)`,
        });
      }
      if (span.vttEnd > vttTokenLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["match", "spans", i, "vttEnd"],
          message: `match.spans[${i}] vttEnd ${span.vttEnd} out of bounds for ${vttTokenLen} vtt tokens`,
        });
      }
      if (span.epubEnd > epubTokenLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["match", "spans", i, "epubEnd"],
          message: `match.spans[${i}] epubEnd ${span.epubEnd} out of bounds for ${epubTokenLen} epub tokens`,
        });
      }
      if (lastSpan) {
        if (lastSpan.vttEnd > span.vttStart) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["match", "spans", i, "vttStart"],
            message: `match.spans[${i}] overlaps match.spans[${i - 1}] on the vtt axis: prev vttEnd ${lastSpan.vttEnd} > vttStart ${span.vttStart}`,
          });
        }
        if (lastSpan.epubEnd > span.epubStart) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["match", "spans", i, "epubStart"],
            message: `match.spans[${i}] overlaps match.spans[${i - 1}] on the epub axis: prev epubEnd ${lastSpan.epubEnd} > epubStart ${span.epubStart}`,
          });
        }
      }
      lastSpan = span;
    });

    // Gaps may be legitimately empty on one axis (e.g. an EPUB-only
    // insertion with no corresponding VTT words), so only the bounds check
    // applies — not the non-empty/equal-width/overlap rules spans get.
    artifact.match.gaps.forEach((gap, i) => {
      if (gap.vttEnd > vttTokenLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["match", "gaps", i, "vttEnd"],
          message: `match.gaps[${i}] vttEnd ${gap.vttEnd} out of bounds for ${vttTokenLen} vtt tokens`,
        });
      }
      if (gap.epubEnd > epubTokenLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["match", "gaps", i, "epubEnd"],
          message: `match.gaps[${i}] epubEnd ${gap.epubEnd} out of bounds for ${epubTokenLen} epub tokens`,
        });
      }
    });
  });

export type AlignmentArtifact = z.infer<typeof alignmentArtifactSchema>;

// Deliberately narrower than result.ts's ResultSource: this is the only
// input buildAlignmentArtifact accepts, so it cannot smuggle filesystem
// paths into the public artifact even by accident.
export interface ArtifactSource {
  root: string;
  base: string;
}

/** Round a seconds value to millisecond precision for the wire. */
function roundToMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function buildAlignmentArtifact(
  alignment: BookAlignment,
  source: ArtifactSource,
): AlignmentArtifact {
  const artifact: AlignmentArtifact = {
    schemaVersion: ALIGNMENT_ARTIFACT_SCHEMA_VERSION,
    features: [],
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
    match: {
      spans: alignment.spans.map((span) => ({
        passId: span.passId,
        vttStart: span.vttStart,
        vttEnd: span.vttEnd,
        epubStart: span.epubStart,
        epubEnd: span.epubEnd,
        evidence: span.evidence,
      })),
      gaps: alignment.gaps.map((gap) => ({ ...gap })),
      metrics: alignment.metrics,
    },
    vtt: {
      cues: {
        startSec: alignment.vtt.cues.map((cue) => roundToMs(cue.startSec)),
        endSec: alignment.vtt.cues.map((cue) => roundToMs(cue.endSec)),
        text: alignment.vtt.cues.map((cue) => cue.text),
      },
      tokens: {
        cueIndex: alignment.vtt.words.map((w) => w.cueIndex),
        charStart: alignment.vtt.words.map((w) => w.charStart),
        charEnd: alignment.vtt.words.map((w) => w.charEnd),
      },
    },
    epub: {
      spines: alignment.epub.spineDocs.map((doc) => ({
        href: doc.spineHref,
        parseMode: doc.parseMode,
        segPaths: doc.dom.segPaths,
        segTextLen: doc.dom.segTextLen,
      })),
      tokens: buildEpubTokenColumns(alignment),
    },
  };
  return alignmentArtifactSchema.parse(artifact);
}

/** Same per-token locator mapping as buildEpubLocatorIndex
 * (apps/bookplayer/src/lib/epub-locator.ts), columnar instead of typed-array
 * base64. */
function buildEpubTokenColumns(
  alignment: BookAlignment,
): AlignmentArtifact["epub"]["tokens"] {
  const spineIndex: number[] = [];
  const startSeg: number[] = [];
  const startOffset: number[] = [];
  const endSeg: number[] = [];
  const endOffset: number[] = [];

  alignment.epub.tokens.forEach((token, epubSeq) => {
    const doc = alignment.epub.spineDocs[token.spineIndex];
    const locator = doc?.dom.tokenLocators[token.tokenIndex];
    if (!doc || !locator) {
      throw new Error(
        `missing dom locator for epub token ${epubSeq} (spine ${token.spineIndex}, tokenIndex ${token.tokenIndex})`,
      );
    }
    spineIndex.push(token.spineIndex);
    startSeg.push(locator.startSeg);
    startOffset.push(locator.startOffset);
    endSeg.push(locator.endSeg);
    endOffset.push(locator.endOffset);
  });

  return { spineIndex, startSeg, startOffset, endSeg, endOffset };
}
