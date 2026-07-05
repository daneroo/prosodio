/**
 * Matching contracts. The matcher sees only normalized tokens and opaque
 * sequence offsets; no VTT cue, DOM, or CFI knowledge enters here. All ranges
 * are half-open token offsets into the flat VTT and EPUB sequences.
 */

/**
 * The canonical EPUB position: a half-open character range in one spine
 * document's normalized text stream. The extraction layer owns the mapping
 * back to raw text (and eventually a viewer range); the matcher treats this
 * value as opaque.
 */
export interface EpubTextAddress {
  spineIndex: number;
  spineHref: string;
  start: number;
  end: number;
}

/**
 * Evidence makes confidence ordinal and explainable: a globally unique k=6
 * anchor outranks a k=4 anchor unique only within one residual gap. No
 * fabricated floating-point confidence score.
 */
export interface SpanEvidence {
  kind: "exact-unique-ngram";
  ngramSize: number;
  uniquenessScope: "global" | "gap";
  /** Coalesced candidate n-grams backing this span. */
  anchors: number;
  /** Tokens gained by exact extension beyond the coalesced n-grams. */
  extendedLeft: number;
  extendedRight: number;
}

export interface MatchedSpan {
  passId: string;
  /** Half-open token ranges; equal length on both sides for exact spans. */
  vttStart: number;
  vttEnd: number;
  epubStart: number;
  epubEnd: number;
  evidence: SpanEvidence;
}

/** An unresolved region between neighboring accepted spans (or stream ends). */
export interface ResidualGap {
  vttStart: number;
  vttEnd: number;
  epubStart: number;
  epubEnd: number;
}
