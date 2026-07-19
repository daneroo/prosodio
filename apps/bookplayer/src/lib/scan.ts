/**
 * Library scanner: recursively walk a root's corpora dir and group each
 * directory's files into canonical book records (exactly one .m4b plus
 * cover.jpg|cover.png; .epub and a basename-matched .vtt are capabilities).
 * Orphan assets never become books. The walk is hidden-safe (dot entries
 * skipped), records a finding and continues on unreadable directories, and
 * does not follow directory symlinks.
 */
import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

import type { RootSet } from "./config.ts";
import type {
  BookRecord,
  Fingerprint,
  MatchClass,
  ScanFinding,
} from "./types.ts";

export interface ScanResult {
  books: Array<BookRecord>;
  findings: Array<ScanFinding>;
}

/** Exact vtt names and a normalized->actual lookup, built once per scan
 *  (D2b) so grading doesn't restat the transcriptions dir per book. */
interface VttIndex {
  exact: Set<string>;
  normalized: Map<string, string>;
}

// ENTRY POINT
export function scanRoot(root: RootSet): ScanResult {
  const books: Array<BookRecord> = [];
  const findings: Array<ScanFinding> = [];
  const vttIndex = buildVttIndex(root.transcriptionsDir);
  walkDirectory(root, "", books, findings, vttIndex);
  dropDuplicateIds(books, findings);
  books.sort((a, b) => a.basename.localeCompare(b.basename));
  return { books, findings };
}

function buildVttIndex(transcriptionsDir: string): VttIndex {
  const exact = new Set<string>();
  const normalized = new Map<string, string>();
  let entries;
  try {
    entries = readdirSync(transcriptionsDir, { withFileTypes: true });
  } catch {
    return { exact, normalized };
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (extname(entry.name).toLowerCase() !== ".vtt") continue;
    const vttBasename = basename(entry.name, extname(entry.name));
    exact.add(vttBasename);
    normalized.set(normalizeBasename(vttBasename), entry.name);
  }
  return { exact, normalized };
}

/** Lowercase, Unicode-normalize, strip punctuation, collapse whitespace —
 *  the "near match" equivalence class (D2b). Punctuation is stripped before
 *  whitespace collapse so removed separators (e.g. "-") don't leave
 *  double spaces behind. */
export function normalizeBasename(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Grades two basenames against each other. Callers decide "absent" when no
 *  candidate exists at all — that's not a string comparison. */
export function classifyMatch(
  a: string,
  b: string,
): Exclude<MatchClass, "absent"> {
  if (a === b) return "exact";
  if (normalizeBasename(a) === normalizeBasename(b)) return "near";
  return "mismatch";
}

/** Stable 12-hex public id from the normalized m4b basename (seed contract). */
export function makeBookId(m4bBasename: string): string {
  const normalized = m4bBasename.toLowerCase().trim();
  return createHash("sha1").update(normalized).digest("hex").slice(0, 12);
}

/**
 * "Author - Title" and "Author - Series NN - Title" both map to
 * { author, title }; anything without the separator is all title.
 */
export function parseBasename(name: string): {
  author: string | null;
  title: string;
} {
  const sepIndex = name.indexOf(" - ");
  if (sepIndex === -1) return { author: null, title: name };
  const author = name.slice(0, sepIndex).trim();
  const rest = name.slice(sepIndex + 3).trim();
  const lastSep = rest.lastIndexOf(" - ");
  const title = lastSep !== -1 ? rest.slice(lastSep + 3).trim() : rest;
  return { author, title: title || rest || name };
}

// WALK

function walkDirectory(
  root: RootSet,
  relDir: string,
  books: Array<BookRecord>,
  findings: Array<ScanFinding>,
  vttIndex: VttIndex,
): void {
  const absDir = join(root.corporaDir, relDir);
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch (error) {
    findings.push({
      code: "unreadable-dir",
      relDir: relDir || ".",
      detail: `unreadable directory "${relDir || "."}": ${String(error)}`,
    });
    return;
  }

  const visible = entries.filter((e) => !e.name.startsWith("."));
  const m4bNames: Array<string> = [];
  const epubNames: Array<string> = [];
  let hasJpg = false;
  let hasPng = false;
  const subdirs: Array<string> = [];

  for (const entry of visible) {
    // Dirent-based: directory symlinks are neither files nor directories
    // here, so the walk cannot escape the root through them.
    if (entry.isDirectory()) {
      subdirs.push(entry.name);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (ext === ".m4b") m4bNames.push(entry.name);
    else if (ext === ".epub") epubNames.push(entry.name);
    else if (entry.name === "cover.jpg") hasJpg = true;
    else if (entry.name === "cover.png") hasPng = true;
  }

  const record = groupDirectory(
    root,
    relDir,
    { m4bNames, epubNames, hasJpg, hasPng },
    findings,
    vttIndex,
  );
  if (record) books.push(record);

  for (const subdir of subdirs.sort()) {
    walkDirectory(root, join(relDir, subdir), books, findings, vttIndex);
  }
}

// GROUP

interface DirectoryFiles {
  m4bNames: Array<string>;
  epubNames: Array<string>;
  hasJpg: boolean;
  hasPng: boolean;
}

function groupDirectory(
  root: RootSet,
  relDir: string,
  files: DirectoryFiles,
  findings: Array<ScanFinding>,
  vttIndex: VttIndex,
): BookRecord | null {
  const { m4bNames, epubNames, hasJpg, hasPng } = files;
  if (m4bNames.length === 0) return null;
  if (m4bNames.length > 1) {
    findings.push({
      code: "multi-m4b",
      relDir,
      detail: `"${relDir}" holds ${m4bNames.length} .m4b files; the single-m4b invariant excludes it`,
    });
    return null;
  }
  if (!hasJpg && !hasPng) {
    findings.push({
      code: "no-cover",
      relDir,
      detail: `"${relDir}" has an .m4b but no cover.jpg/cover.png; skipped`,
    });
    return null;
  }

  const m4bName = m4bNames[0];
  if (!m4bName) return null;
  const m4bBasename = basename(m4bName, extname(m4bName));
  const coverName = hasJpg ? "cover.jpg" : "cover.png";

  // Epub side: graded against the one epub chosen for this dir (D2b). No
  // finding is emitted here — match quality replaces the old prose warning.
  let epubRelPath: string | null = null;
  let epubMatch: MatchClass = "absent";
  if (epubNames.length > 0) {
    const epubName = [...epubNames].sort()[0];
    if (!epubName) return null;
    epubRelPath = join(relDir, epubName);
    const epubBasename = basename(epubName, extname(epubName));
    epubMatch = classifyMatch(m4bBasename, epubBasename);
  }

  // Vtt side: exact name is the playback contract (hasVtt); a normalized-only
  // hit grades "near" but does not count as present (align-soft-basename-
  // match backlog item, not a behavior change here).
  let vttMatch: MatchClass;
  let hasVtt: boolean;
  if (vttIndex.exact.has(m4bBasename)) {
    vttMatch = "exact";
    hasVtt = true;
  } else if (vttIndex.normalized.has(normalizeBasename(m4bBasename))) {
    vttMatch = "near";
    hasVtt = false;
  } else {
    vttMatch = "absent";
    hasVtt = false;
  }

  const m4bRelPath = join(relDir, m4bName);
  const fingerprint = fingerprintFile(root.corporaDir, m4bRelPath);
  const { author, title } = parseBasename(m4bBasename);

  return {
    id: makeBookId(m4bBasename),
    basename: m4bBasename,
    rootName: root.name,
    relDir,
    m4bRelPath,
    coverRelPath: join(relDir, coverName),
    epubRelPath,
    epubMatch,
    hasVtt,
    vttMatch,
    metadata: {
      title,
      author,
      durationSec: null,
      bitrateKbps: null,
      codec: null,
      sizeBytes: fingerprint.size,
    },
    fingerprint,
  };
}

function fingerprintFile(corporaDir: string, relPath: string): Fingerprint {
  try {
    const stat = statSync(join(corporaDir, relPath));
    return { relPath, mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return { relPath, mtimeMs: 0, size: 0 };
  }
}

/**
 * Duplicate normalized basenames share a public id by design (the basename
 * IS the canonical key); the first record in sorted relDir order wins and
 * later ones are excluded with a finding.
 */
function dropDuplicateIds(
  books: Array<BookRecord>,
  findings: Array<ScanFinding>,
): void {
  books.sort((a, b) => a.relDir.localeCompare(b.relDir));
  const firstById = new Map<string, BookRecord>();
  const kept: Array<BookRecord> = [];
  for (const book of books) {
    const first = firstById.get(book.id);
    if (first) {
      findings.push({
        code: "duplicate-basename",
        relDir: book.relDir,
        detail: `duplicate basename "${book.basename}" in "${book.relDir}"; keeping "${first.relDir}"`,
      });
      continue;
    }
    firstById.set(book.id, book);
    kept.push(book);
  }
  books.length = 0;
  books.push(...kept);
}
