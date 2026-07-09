/**
 * @prosodio/align — the sparse VTT–EPUB alignment engine (epoch 4), extracted
 * from apps/align so the CLI and bookplayer share one implementation. IO stays
 * at the edges: text/paths in, pure serialized data out (jsdom is confined to
 * EPUB extraction, server-side only). Design:
 * thoughts/design/epoch4-alignment-design.md; extraction decision record:
 * thoughts/plans/bookplayer-align.md.
 */
export { alignBook } from "./src/align-book.ts";
export type { AlignOptions, BookAlignment } from "./src/align-book.ts";
export {
  ALIGNMENT_ARTIFACT_SCHEMA_VERSION,
  alignmentArtifactSchema,
  buildAlignmentArtifact,
  gapSchema,
  metricsSchema,
  spanEvidenceSchema,
} from "./src/artifact.ts";
export type { AlignmentArtifact, ArtifactSource } from "./src/artifact.ts";
export {
  activeTokenAt,
  deriveCueAggregates,
  deriveEpubSeq,
  deriveTokenEndTimes,
  deriveTokenTimes,
  epubLocatorAt,
  tokenRaw,
} from "./src/artifact-derive.ts";
export type {
  CueAggregates,
  EpubTokenLocation,
} from "./src/artifact-derive.ts";
export { checkSectionParity } from "./src/section-parity.ts";
export type { SectionParityResult } from "./src/section-parity.ts";
export { config as alignConfig } from "./src/config.ts";
export type {
  EpubTextAddress,
  MatchedSpan,
  ResidualGap,
  SpanEvidence,
} from "./src/contracts.ts";
export { rangeFromDomPath } from "./src/epub-dom-path.ts";
export type { DomTokenLocator, SegPath } from "./src/epub-dom-path.ts";
export {
  extractEpub,
  projectVisibleText,
  resolveAddresses,
} from "./src/epub-extract.ts";
export type { EpubExtraction } from "./src/epub-extract.ts";
export { computeGaps } from "./src/reconcile.ts";
export {
  ALIGNMENT_RESULT_SCHEMA_VERSION,
  alignmentResultSchema,
  buildAlignmentResult,
} from "./src/result.ts";
export type { AlignmentResult, ResultSource } from "./src/result.ts";
export { buildVttSequence } from "./src/vtt-sequence.ts";
export type { VttSequence, VttWord } from "./src/vtt-sequence.ts";
