/**
 * Algorithm parameters for the alignment engine — split from the CLI's path
 * config when apps/align/lib became packages/align (plan
 * thoughts/plans/bookplayer-align.md, D1/D2). Values are fixed baselines to
 * evaluate, not eternal constants; every result echoes them so runs are
 * reproducible. Paths and discovery roots live with consumers
 * (apps/align/lib/config.ts, apps/bookplayer/src/lib/config.ts).
 */
export const config = {
  // Alignment parameters.
  passes: {
    // Pass 1: exact n-grams unique in both complete token streams.
    pass1NgramSize: 6,
    // Multipass proof: smaller exact n-grams, unique per residual gap.
    proofNgramSize: 4,
  },
  // Strict Unicode-aware Pass 1 normalization (design: NFKC, lowercase,
  // [^\p{L}\p{N}]+ boundaries). The id names the policy in result provenance.
  normalizationPolicy: "strict-nfkc-v1",
  extraction: {
    // Conservative baseline: linear="no" spine items are included; evaluation
    // compares an exclusion variant before any default change (recorded
    // configuration, since real spine metadata may be unreliable).
    includeNonLinearSpineItems: true,
    // Structurally unambiguous non-content excluded from text extraction.
    excludedElements: ["head", "script", "style"],
  },
  // Review-worklist thresholds. Anomalies flag spans/gaps/documents for manual
  // review; they never prove an anchor correct or remove content from metrics.
  metrics: {
    // Spine documents below this match ratio are flagged (zero-match always).
    lowMatchRatio: 0.1,
    // Rolling anchor density bucket, in narration minutes.
    densityBucketMinutes: 10,
    // Implied narration words-per-minute plausibility band across a gap.
    anomalyWpmMin: 80,
    anomalyWpmMax: 260,
    // EPUB/VTT token-count ratio band across a gap (checked above a floor).
    anomalyWordRatioMin: 0.5,
    anomalyWordRatioMax: 2,
    anomalyGapMinTokens: 20,
  },
};
