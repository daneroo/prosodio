/**
 * Library index types. All paths are relative to the active root's dirs and
 * stay server-side; clients only ever see ids and derived asset URLs.
 */
import type { RootName } from "./config.ts";

/** m4b identity for cache invalidation: probe again only when this changes. */
export interface Fingerprint {
  relPath: string;
  mtimeMs: number;
  size: number;
}

/** One series membership parsed from the `grouping` tag; a book can belong
 *  to multiple (docs/corpora/metadata.md). */
export interface BookSeries {
  name: string;
  position: number | null;
}

export interface BookMetadata {
  title: string;
  author: string | null;
  series: Array<BookSeries>;
  narrator: string | null;
  /** Provenance for title/author/series/narrator (docs/corpora/metadata.md):
   *  "pending" is the scan-time seed before ffprobe has run; "tags" means the
   *  extractor used the m4b tags (the normal, trusted path); "basename" means
   *  the probe ran but the title tag was absent — a data defect, not a
   *  variant, and it always pairs with a metadata-basename-fallback finding. */
  source: "tags" | "basename" | "pending";
  durationSec: number | null;
  bitrateKbps: number | null;
  codec: string | null;
  sizeBytes: number;
}

/**
 * Graded basename-pairing quality (plan lab-routes-refined D2b): "near" is an
 * almost-match (case/whitespace/punctuation only) — the actionable class for
 * corpus naming anomalies. Detection only; no effect on discovery/pairing.
 */
export type MatchClass = "exact" | "near" | "mismatch" | "absent";

/** Canonical record: a directory holding exactly one .m4b plus a cover. */
export interface BookRecord {
  /** sha1(normalized m4b basename).slice(0, 12) — stable public id. */
  id: string;
  /** Original m4b basename (no extension): diagnostics + VTT matching. */
  basename: string;
  rootName: RootName;
  /** Book directory relative to the root's corporaDir. */
  relDir: string;
  m4bRelPath: string;
  coverRelPath: string;
  epubRelPath: string | null;
  /** m4b<->epub basename match quality (D2b); epubRelPath still points at
   *  the chosen epub regardless of match class. */
  epubMatch: MatchClass;
  /** True only for an exact-name vtt match — the playback contract is
   *  unchanged by grading (a "near" vtt is not treated as present). */
  hasVtt: boolean;
  /** m4b<->vtt basename match quality (D2b). "mismatch" cannot occur here:
   *  unlike epub (one candidate chosen per dir), the transcriptions dir has
   *  no single candidate to fall short of matching — a non-exact,
   *  non-normalized name is simply "absent". */
  vttMatch: MatchClass;
  metadata: BookMetadata;
  fingerprint: Fingerprint;
}

/** Structured scan diagnostic (plan lab-routes-refined D2), replacing prose
 *  warnings. The first four codes each mark an EXCLUDED directory/candidate,
 *  so `bookId` is unset for them; `metadata-basename-fallback` is the first
 *  code that attaches to a KEPT book (`bookId` is set), and `bookId` exists on
 *  `ScanFinding` for it and any future finding codes of that kind. */
export type ScanFindingCode =
  | "unreadable-dir" // readdir failed
  | "multi-m4b" // >1 .m4b in a dir -> dir excluded
  | "no-cover" // .m4b without cover.jpg/png -> dir excluded
  | "duplicate-basename" // same normalized basename elsewhere -> excluded
  | "metadata-basename-fallback"; // kept book; title tag absent -> basename used

export interface ScanFinding {
  code: ScanFindingCode;
  relDir: string;
  /** Human sentence, roughly the old warning text. */
  detail: string;
  /** Present when the finding maps to a kept book. */
  bookId?: string;
}

export interface LibraryIndex {
  rootName: RootName;
  books: Array<BookRecord>;
  findings: Array<ScanFinding>;
  scannedAt: string;
  scanDurationMs: number;
}

export interface BookCache {
  /** v4 = series/narrator/source on BookMetadata plus the
   *  metadata-basename-fallback finding (metadata-canonical-from-tags S2). */
  version: 4;
  rootName: RootName;
  scannedAt: string;
  books: Array<BookRecord>;
  findings: Array<ScanFinding>;
}
