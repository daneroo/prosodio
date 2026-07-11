/**
 * Browser-safe subset of @prosodio/align: pure DOM/text code with NO jsdom or
 * node imports, so client bundles (bookplayer) can import it without pulling
 * in the server-only extraction engine (epub-extract.ts imports jsdom at
 * module scope). Import this from client code; the package root ("@prosodio/
 * align") is server-only and must stay behind a dynamic import().
 */
export {
  diagnoseRangeFromDomPath,
  rangeFromDomPath,
} from "./src/epub-dom-path.ts";
export type { DomTokenLocator, SegPath } from "./src/epub-dom-path.ts";
export {
  buildSegPathIndex,
  epubSeqAtDomPoint,
  segIndexForTextNode,
  vttSeqForEpubSeq,
} from "./src/epub-dom-point.ts";
export type { SegPathIndex } from "./src/epub-dom-point.ts";
export { normalizeText } from "./src/normalize.ts";
export type { NormalizedText, Token } from "./src/normalize.ts";
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
// Type-only: AlignmentArtifact is a zod-inferred type, but importing only the
// type (not alignmentArtifactSchema) keeps zod's runtime out of the browser
// bundle graph.
export type { AlignmentArtifact } from "./src/artifact.ts";
