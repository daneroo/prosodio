/**
 * @prosodio/corpus — public API
 *
 * Re-exports from internal modules. Consumers should import from
 * "@prosodio/corpus" rather than reaching into individual files.
 */

// Types
export type {
  BookMetadata,
  BookRecord,
  BookSeries,
  CorpusRoot,
  Fingerprint,
  MatchClass,
  MtimeHints,
  ScanFinding,
  ScanFindingCode,
  Severity,
} from "./types.ts";
export { FINDING_SEVERITY } from "./types.ts";

// Scanner
export {
  classifyMatch,
  makeBookId,
  normalizeBasename,
  parseBasename,
  scanRoot,
} from "./scan.ts";
export type { ScanResult } from "./scan.ts";

// Metadata extraction
export { extractMetadata, parseGrouping } from "./metadata.ts";

// ffprobe
export { probeFile } from "./ffprobe.ts";
export type { ProbeFn, ProbeResult } from "./ffprobe.ts";

// Findings
export { basenameFallbackFinding, postProbeFindings } from "./findings.ts";

// Deep rules (CLI-executed, S3): hygiene + mtime hints
export { hygieneFindings } from "./hygiene.ts";
export { mtimeFindings } from "./mtime.ts";
