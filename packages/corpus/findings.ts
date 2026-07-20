/**
 * Finding constructors that live outside scan.ts's own walk (moved from
 * apps/bookplayer/src/lib/library.ts, validate-bootstrap S1): the
 * metadata-basename-fallback finding is only known once ffprobe has run, so
 * it's raised by whichever caller enriches a book, not by scanRoot itself.
 * Single construction site so bookplayer's library and the future
 * apps/validate-cli CLI (both re-deriving/emitting this finding) can't drift.
 */
import { FINDING_SEVERITY } from "./types.ts";
import type { BookRecord, ScanFinding } from "./types.ts";

export function basenameFallbackFinding(book: BookRecord): ScanFinding {
  return {
    code: "metadata-basename-fallback",
    relDir: book.relDir,
    bookId: book.id,
    detail: `"${book.relDir}" has no title tag; used the basename "${book.basename}" instead`,
    severity: FINDING_SEVERITY["metadata-basename-fallback"],
  };
}
