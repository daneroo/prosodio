/**
 * Mtime hint rules (plan merge-nx-audiobook-validation, "Mtime hints
 * design"): pure comparison of a scanned book's mtimes against an INJECTED
 * hints DB. The package never touches the hints file itself — loading
 * `data/validate/mtime/<rootName>.mtime-hints.json` and the bare-path /
 * bootstrap decisions (named roots only; `hints === null` for the bootstrap
 * "no DB yet" state) are the CLI's (S3) job. No restat of the m4b: the
 * fingerprint already captured from the scan is authoritative here.
 */
import { statSync } from "node:fs";
import { join } from "node:path";

import { FINDING_SEVERITY } from "./types.ts";
import type { BookRecord, MtimeHints, ScanFinding } from "./types.ts";

export function mtimeFindings(
  books: Array<BookRecord>,
  hints: MtimeHints | null,
  corporaDir: string,
): Array<ScanFinding> {
  if (hints === null) {
    // Bootstrap state (plan: "a named root with NO hints file at all skips
    // the mtime rules with a single 'no hints DB' warning" — absent-hint
    // being a FAILURE presumes a DB exists in the first place).
    return [
      {
        code: "mtime-hints-missing",
        relDir: ".",
        detail:
          "no mtime hints DB exists for this root; run --record-mtimes to create one",
        severity: FINDING_SEVERITY["mtime-hints-missing"],
      },
    ];
  }

  const findings: Array<ScanFinding> = [];
  const matchedKeys = new Set<string>();

  for (const book of books) {
    const hint = hints[book.basename];
    if (hint === undefined) {
      findings.push({
        code: "mtime-absent",
        relDir: book.relDir,
        bookId: book.id,
        detail: `"${book.basename}" has no mtime hint entry`,
        severity: FINDING_SEVERITY["mtime-absent"],
      });
      continue;
    }
    matchedKeys.add(book.basename);
    pushMismatchIfAny(book, hint, corporaDir, findings);
  }

  // Orphaned entries (plan: "always-on WARNING — nx's own unfinished TODO").
  for (const key of Object.keys(hints)) {
    if (matchedKeys.has(key)) continue;
    findings.push({
      code: "orphan-hint",
      relDir: ".",
      detail: `mtime hint "${key}" matches no book`,
      severity: FINDING_SEVERITY["orphan-hint"],
    });
  }

  return findings;
}

/** Compares at SECOND granularity (plan: nx parity) over both the m4b file
 *  and its containing book dir; either differing emits ONE finding naming
 *  which part(s) mismatched. */
function pushMismatchIfAny(
  book: BookRecord,
  hint: string,
  corporaDir: string,
  findings: Array<ScanFinding>,
): void {
  const expectedSec = Math.floor(Date.parse(hint) / 1000);
  const m4bSec = Math.floor(book.fingerprint.mtimeMs / 1000);

  let dirSec: number | null;
  try {
    dirSec = Math.floor(statSync(join(corporaDir, book.relDir)).mtimeMs / 1000);
  } catch {
    dirSec = null;
  }

  const m4bMismatch = m4bSec !== expectedSec;
  const dirMismatch = dirSec !== null && dirSec !== expectedSec;
  if (!m4bMismatch && !dirMismatch) return;

  const part =
    m4bMismatch && dirMismatch ? "both" : m4bMismatch ? "m4b" : "dir";
  const expectedIso = toIsoSeconds(expectedSec);
  const parts: Array<string> = [];
  if (m4bMismatch) {
    parts.push(`m4b expected ${expectedIso}, actual ${toIsoSeconds(m4bSec)}`);
  }
  if (dirMismatch && dirSec !== null) {
    parts.push(`dir expected ${expectedIso}, actual ${toIsoSeconds(dirSec)}`);
  }

  findings.push({
    code: "mtime-mismatch",
    relDir: book.relDir,
    bookId: book.id,
    detail: `"${book.basename}" mtime mismatch (${part}): ${parts.join("; ")}`,
    severity: FINDING_SEVERITY["mtime-mismatch"],
  });
}

function toIsoSeconds(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
