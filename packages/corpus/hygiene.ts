/**
 * Deep hygiene rules (plan merge-nx-audiobook-validation, "The vet" +
 * "Severity"): report-only filesystem hygiene independent of book grouping —
 * `.DS_Store` presence, unix permission bits, and extended attributes. Runs
 * its OWN walk rather than reuse scanRoot's: that walk deliberately skips dot
 * entries (book grouping doesn't care about them) but `.DS_Store` detection
 * needs to see exactly those. Pure function of a corpora dir path — no book
 * knowledge, no env/named-root knowledge; the CLI (S3) is the only caller.
 */
import { execFile } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { FINDING_SEVERITY } from "./types.ts";
import type { ScanFinding } from "./types.ts";

const FILE_MODE = 0o644;
const DIR_MODE = 0o755;
/** Generous ceiling for `xattr -r` output on a large corpus (one subprocess
 *  for the whole tree, per the design — not per-file). */
const XATTR_MAX_BUFFER = 64 * 1024 * 1024;
/** nx Justfile special case: unremovable on modern macOS, so a path whose
 *  ONLY attribute is this one is tolerated rather than flagged. */
const TOLERATED_XATTR = "com.apple.provenance";

export async function hygieneFindings(
  corporaDir: string,
): Promise<Array<ScanFinding>> {
  const findings: Array<ScanFinding> = [];
  checkDirPerms(corporaDir, ".", findings);
  walkForHygiene(corporaDir, "", findings);
  await checkXattrs(corporaDir, findings);
  return findings;
}

// DS_STORE + PERMS WALK
//
// Dot-entries INCLUDED (unlike scan.ts's walkDirectory) so .DS_Store is
// visible; directory symlinks are still never followed — Dirent-based
// isDirectory()/isFile() checks mean a symlink is neither, same guarantee
// scan.ts relies on.

function walkForHygiene(
  corporaDir: string,
  relDir: string,
  findings: Array<ScanFinding>,
): void {
  const absDir = join(corporaDir, relDir);
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    // scanRoot already raises unreadable-dir for the book walk; this second
    // walk just skips what it can't read rather than double-reporting.
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childRelDir = join(relDir, entry.name);
      checkDirPerms(join(corporaDir, childRelDir), childRelDir, findings);
      walkForHygiene(corporaDir, childRelDir, findings);
      continue;
    }
    if (!entry.isFile()) continue;

    if (entry.name === ".DS_Store") {
      findings.push({
        code: "ds-store",
        relDir: relDir || ".",
        detail: `".DS_Store" exists in "${relDir || "."}"`,
        severity: FINDING_SEVERITY["ds-store"],
      });
      // Existence is already flagged above; a perm check on it too would
      // just be noise (it's not a file anyone maintains by hand).
      continue;
    }

    checkFilePerms(
      join(absDir, entry.name),
      relDir || ".",
      entry.name,
      findings,
    );
  }
}

function checkDirPerms(
  absPath: string,
  relDir: string,
  findings: Array<ScanFinding>,
): void {
  let mode: number;
  try {
    mode = statSync(absPath).mode & 0o777;
  } catch {
    return;
  }
  if (mode === DIR_MODE) return;
  findings.push({
    code: "bad-perms",
    relDir,
    detail: `directory "${relDir}" has mode 0${octal(mode)}, expected 0${octal(DIR_MODE)}`,
    severity: FINDING_SEVERITY["bad-perms"],
  });
}

function checkFilePerms(
  absPath: string,
  relDir: string,
  fileName: string,
  findings: Array<ScanFinding>,
): void {
  let mode: number;
  try {
    mode = statSync(absPath).mode & 0o777;
  } catch {
    return;
  }
  if (mode === FILE_MODE) return;
  findings.push({
    code: "bad-perms",
    relDir,
    detail: `file "${fileName}" in "${relDir}" has mode 0${octal(mode)}, expected 0${octal(FILE_MODE)}`,
    severity: FINDING_SEVERITY["bad-perms"],
  });
}

function octal(mode: number): string {
  return mode.toString(8).padStart(3, "0");
}

// XATTRS
//
// One subprocess for the whole tree (`xattr -r <corporaDir>`), not per-file —
// the design's efficiency requirement on large corpora.

function runXattrRecursive(corporaDir: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "xattr",
      ["-r", corporaDir],
      { maxBuffer: XATTR_MAX_BUFFER },
      (error, stdout) => {
        // Missing binary, non-zero exit, or any other subprocess error:
        // portability (this is a macOS-only tool) — never a finding.
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function checkXattrs(
  corporaDir: string,
  findings: Array<ScanFinding>,
): Promise<void> {
  const stdout = await runXattrRecursive(corporaDir);
  if (stdout === null) return;

  const attrsByPath = new Map<string, Array<string>>();
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    // `xattr -r` lines look like "<path>: <attrname>". Paths can themselves
    // contain ": " (verified with a fixture filename), but attribute names
    // don't, so splitting on the LAST ": " correctly separates the two even
    // for such a path. (Limitation: an attribute name containing ": " itself
    // would defeat this — not known to occur in practice.)
    const sepIndex = line.lastIndexOf(": ");
    if (sepIndex === -1) continue;
    const path = line.slice(0, sepIndex);
    const attr = line.slice(sepIndex + 2);
    const existing = attrsByPath.get(path);
    if (existing) existing.push(attr);
    else attrsByPath.set(path, [attr]);
  }

  for (const [path, attrs] of attrsByPath) {
    const offending = attrs.filter((attr) => attr !== TOLERATED_XATTR);
    if (offending.length === 0) continue; // sole com.apple.provenance: tolerated

    const relPath = relative(corporaDir, path) || ".";
    const relDir = relPath === "." ? "." : dirname(relPath) || ".";
    findings.push({
      code: "xattr",
      relDir,
      detail: `"${relPath}" has extended attributes: ${offending.join(", ")}`,
      severity: FINDING_SEVERITY["xattr"],
    });
  }
}
