/**
 * Library index types. All paths are relative to the active root's dirs and
 * stay server-side; clients only ever see ids and derived asset URLs.
 *
 * Corpus-truth types (Fingerprint, BookSeries, BookMetadata, MatchClass,
 * BookRecord, ScanFindingCode, ScanFinding) moved to @prosodio/corpus
 * (validate-bootstrap S1) — importers should pull those directly from the
 * package, not through here. BookCache and LibraryIndex stay app-side:
 * cache/serving concerns, not corpus truth.
 */
import type { RootName } from "./config.ts";
import type { BookRecord, ScanFinding } from "@prosodio/corpus";

export interface LibraryIndex {
  rootName: RootName;
  books: Array<BookRecord>;
  findings: Array<ScanFinding>;
  scannedAt: string;
  scanDurationMs: number;
}

export interface BookCache {
  /** v4 = series/narrator/source on BookMetadata plus the
   *  metadata-basename-fallback finding (metadata-canonical-from-tags S2).
   *  v5 = findings carry severity (validate-bootstrap S1); an unchanged
   *  fingerprint would otherwise keep a stale (severity-less) finding via
   *  carryOverMetadata, so the version bump forces one private re-probe. */
  version: 5;
  rootName: RootName;
  scannedAt: string;
  books: Array<BookRecord>;
  findings: Array<ScanFinding>;
}
