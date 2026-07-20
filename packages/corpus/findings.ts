/**
 * Finding constructors that live outside scan.ts's own walk (moved from
 * apps/bookplayer/src/lib/library.ts, validate-bootstrap S1): the
 * metadata-basename-fallback finding is only known once ffprobe has run, so
 * it's raised by whichever caller enriches a book, not by scanRoot itself.
 * Single construction site so bookplayer's library and the future
 * apps/validate-cli CLI (both re-deriving/emitting this finding) can't drift.
 *
 * postProbeFindings (plan merge-nx-audiobook-validation, "The vet") joins the
 * same post-probe stage: duration and missing-author are both only knowable
 * once ffprobe has run.
 */
import { FINDING_SEVERITY } from "./types.ts";
import type { BookRecord, ScanFinding } from "./types.ts";
import type { ProbeResult } from "./ffprobe.ts";

export function basenameFallbackFinding(book: BookRecord): ScanFinding {
  return {
    code: "metadata-basename-fallback",
    relDir: book.relDir,
    bookId: book.id,
    detail: `"${book.relDir}" has no title tag; used the basename "${book.basename}" instead`,
    severity: FINDING_SEVERITY["metadata-basename-fallback"],
  };
}

/** "unprobed" (probe failure) is deliberately never a finding here — only a
 *  successful probe that reports a non-positive duration, or one that found
 *  a title tag but no artist tag, is actionable (vet: KEEP duration, ADD
 *  missing-author). */
export function postProbeFindings(
  book: BookRecord,
  probe: ProbeResult,
): Array<ScanFinding> {
  const findings: Array<ScanFinding> = [];
  if (probe.durationSec !== null && probe.durationSec <= 0) {
    findings.push({
      code: "bad-duration",
      relDir: book.relDir,
      bookId: book.id,
      detail: `"${book.relDir}" probed a duration of ${probe.durationSec}s`,
      severity: FINDING_SEVERITY["bad-duration"],
    });
  }
  if (probe.titleTag !== null && probe.artistTag === null) {
    findings.push({
      code: "metadata-missing-author",
      relDir: book.relDir,
      bookId: book.id,
      detail: `"${book.relDir}" has a title tag but no artist tag`,
      severity: FINDING_SEVERITY["metadata-missing-author"],
    });
  }
  return findings;
}
