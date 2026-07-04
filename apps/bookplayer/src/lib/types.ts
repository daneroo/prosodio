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

export interface BookMetadata {
  title: string;
  author: string | null;
  durationSec: number | null;
  bitrateKbps: number | null;
  codec: string | null;
  sizeBytes: number;
}

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
  hasVtt: boolean;
  metadata: BookMetadata;
  fingerprint: Fingerprint;
}

export interface LibraryIndex {
  rootName: RootName;
  books: Array<BookRecord>;
  warnings: Array<string>;
  scannedAt: string;
  scanDurationMs: number;
}

export interface BookCache {
  version: 1;
  rootName: RootName;
  scannedAt: string;
  books: Array<BookRecord>;
}
