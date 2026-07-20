/**
 * Corpus-truth types: what a scan discovers about a root, independent of any
 * app's caching/serving concerns. Extracted from
 * apps/bookplayer/src/lib/types.ts (validate-bootstrap S1) — BookCache and
 * LibraryIndex stayed behind in bookplayer since those are cache/serving
 * shapes, not corpus truth.
 */

/**
 * A pointable corpus: PURE input to scanRoot, no env/named-root knowledge.
 * `transcriptionsDir` is optional — when absent, the vtt index is empty and
 * every book reads vttMatch "absent" / hasVtt false (bare-path staging, e.g.
 * `apps/validate-cli`). `name` is a plain string here; app-level callers
 * (e.g. @prosodio/config's RootSet) may narrow it to a closed union — RootSet
 * is structurally assignable to CorpusRoot.
 */
export interface CorpusRoot {
  name: string;
  corporaDir: string;
  transcriptionsDir?: string;
}

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
  rootName: string;
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
  | "metadata-basename-fallback" // kept book; title tag absent -> basename used
  | "stray-file" // unrecognized file — not part of any canonical book record
  | "ds-store" // a .DS_Store file exists
  | "bad-perms" // file not 0644 / dir not 0755
  | "xattr" // extended attributes present beyond a sole com.apple.provenance
  | "mtime-absent" // book has no hint entry
  | "mtime-mismatch" // m4b or book-dir mtime differs from the hint
  | "orphan-hint" // hint entry matches no book
  | "mtime-hints-missing" // the root has no hints DB at all (bootstrap state)
  | "bad-duration" // probe succeeded but duration <= 0
  | "metadata-missing-author"; // title tag present, artist absent

/** Gate axis (plan validate-bootstrap D2): "failure" gates a validation run
 *  (PASS = zero failures); "warning" is informational only. Static per code —
 *  see FINDING_SEVERITY. */
export type Severity = "failure" | "warning";

/** Single source of truth for ScanFindingCode -> Severity; every finding
 *  constructor reads from here so the mapping can't drift between call
 *  sites (scan.ts's own findings vs. library.ts's basenameFallbackFinding). */
export const FINDING_SEVERITY: Record<ScanFindingCode, Severity> = {
  "unreadable-dir": "failure",
  "multi-m4b": "failure",
  "no-cover": "failure",
  "duplicate-basename": "failure",
  "metadata-basename-fallback": "warning",
  "stray-file": "warning",
  "ds-store": "warning",
  "bad-perms": "warning",
  xattr: "warning",
  "mtime-absent": "failure",
  "mtime-mismatch": "failure",
  "orphan-hint": "warning",
  "mtime-hints-missing": "warning",
  "bad-duration": "failure",
  "metadata-missing-author": "warning",
};

export interface ScanFinding {
  code: ScanFindingCode;
  relDir: string;
  /** Human sentence, roughly the old warning text. */
  detail: string;
  /** Present when the finding maps to a kept book. */
  bookId?: string;
  /** Static per code (FINDING_SEVERITY); placed last so existing-field order
   *  in persisted/serialized findings is unchanged (validate-bootstrap D2). */
  severity: Severity;
}

/** mtime hints DB shape (plan merge-nx-audiobook-validation, "Mtime hints
 *  design"): keyed by m4b basename (one identity scheme; retags don't orphan
 *  it), value = ISO 8601 seconds Z (e.g. "2026-07-19T19:22:59Z"). Flat
 *  strings, no object/note wrapper — the package stays repo-ignorant; the
 *  CLI (S3) owns loading this from `data/validate/mtime/<rootName>.mtime-hints.json`. */
export type MtimeHints = Record<string, string>;
