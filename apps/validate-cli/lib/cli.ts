/**
 * Pure(ish) core for the standalone validation CLI (validate-bootstrap D4): a
 * thin skin over @prosodio/corpus + @prosodio/config. Three explicit-input
 * functions — resolvePlan (argv -> plan), runValidation (plan -> result),
 * render* (result -> text) — take repoRoot/env/argv as parameters rather than
 * reading process globals, so they're unit-testable without a real process.
 * validate.ts (the entry point) only wires process.argv/env/exit around
 * these. Mirrors apps/bookplayer/src/lib/library.ts's enrich (probe ->
 * extractMetadata -> basenameFallbackFinding, pLimit-bounded) but never
 * touches a cache: every invocation re-derives everything from the corpus.
 *
 * S3 (plan merge-nx-audiobook-validation) wires the S2 deep rules in: hints
 * loading for the mtime rules is CLI-side (packages/corpus stays
 * repo-ignorant) — hintsPathFor is a pure path-derivation function kept
 * separate from resolvePlan's directory resolution so tests can point it at
 * a temp directory without a real repoRoot/@prosodio/config root.
 */
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import pLimit from "p-limit";

import { resolveRoot, resolveRoots } from "@prosodio/config";
import {
  basenameFallbackFinding,
  extractMetadata,
  hygieneFindings,
  mtimeFindings,
  postProbeFindings,
  probeFile,
  scanRoot,
} from "@prosodio/corpus";
import type {
  CorpusRoot,
  MtimeHints,
  ProbeFn,
  ScanFinding,
} from "@prosodio/corpus";

export const USAGE =
  "usage: validate <fixtures|private|path> [--no-probe] [--json] [--record-mtimes]";

// Bounded background ffprobe workers (same default as bookplayer's
// ffprobeConcurrency, apps/bookplayer/src/lib/config.ts).
const PROBE_CONCURRENCY = 4;

export interface UsagePlan {
  kind: "usage";
  message: string;
}

export interface RunPlan {
  kind: "run";
  corpusRoot: CorpusRoot;
  probe: boolean;
  json: boolean;
  /** undefined for bare-path roots (plan: "Bare-path roots: hints =
   *  undefined, mtime rules NOT run at all"); a computed (not yet
   *  necessarily existing) path for named roots. */
  hintsPath: string | undefined;
}

export interface RecordMtimesPlan {
  kind: "record-mtimes";
  corpusRoot: CorpusRoot;
  hintsPath: string;
}

export type Plan = UsagePlan | RunPlan | RecordMtimesPlan;

/** Pure path derivation for a named root's mtime hints DB (plan
 *  "Mtime hints design"): `<repoRoot>/data/validate/mtime/<rootName>.mtime-
 *  hints.json`. Kept separate from resolvePlan's directory resolution so
 *  tests can point this at a temp directory standing in for a repoRoot,
 *  without needing a real @prosodio/config named root. */
export function hintsPathFor(repoRoot: string, rootName: string): string {
  return join(
    repoRoot,
    "data",
    "validate",
    "mtime",
    `${rootName}.mtime-hints.json`,
  );
}

/**
 * Parses argv and resolves the positional argument to a scannable root: a
 * named root (fixtures/private, via @prosodio/config's resolveRoot — reused
 * so the missing-directory/env-override messages can't drift from the rest
 * of the codebase) or a bare existing-directory path (read-only, no
 * transcriptionsDir — vtt reads "absent"). Any failure here is a
 * usage/config error (exit 2, D4). --record-mtimes (S3) is named-roots-only
 * (bare paths have no hints DB identity to write to) and can't combine with
 * --json (it replaces validation output entirely, D3 "Mtime hints design").
 */
export function resolvePlan(
  argv: ReadonlyArray<string>,
  repoRoot: string,
  env: Record<string, string | undefined>,
): Plan {
  let target: string | undefined;
  let probe = true;
  let json = false;
  let recordMtimes = false;

  for (const arg of argv) {
    if (arg === "--no-probe") {
      probe = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--record-mtimes") {
      recordMtimes = true;
    } else if (arg.startsWith("-")) {
      return { kind: "usage", message: `unknown flag "${arg}"\n${USAGE}` };
    } else if (target === undefined) {
      target = arg;
    } else {
      return {
        kind: "usage",
        message: `unexpected argument "${arg}"\n${USAGE}`,
      };
    }
  }

  if (target === undefined) {
    return { kind: "usage", message: USAGE };
  }

  if (recordMtimes && json) {
    return {
      kind: "usage",
      message: `--record-mtimes cannot combine with --json\n${USAGE}`,
    };
  }

  const named = resolveRoots(repoRoot, env).find((r) => r.name === target);
  if (named) {
    try {
      // resolveRoot re-validates both dirs and throws its own describe-role
      // (corporaDir/transcriptionsDir) + env-override message; RootSet is
      // structurally a CorpusRoot (packages/corpus/types.ts).
      const corpusRoot = resolveRoot(
        repoRoot,
        env,
        named.name,
        "root argument",
      );
      const hintsPath = hintsPathFor(repoRoot, named.name);
      if (recordMtimes) {
        return { kind: "record-mtimes", corpusRoot, hintsPath };
      }
      return { kind: "run", corpusRoot, probe, json, hintsPath };
    } catch (error) {
      return { kind: "usage", message: toMessage(error) };
    }
  }

  // Not a named root: treat as a bare path. Resolved to an absolute path so
  // the run is stable regardless of cwd (also doubles as the "name" shown
  // in output — there is no other identity for a bare-path root).
  const bareDir = resolve(target);
  if (!isDirectory(bareDir)) {
    return {
      kind: "usage",
      message: `"${target}" is not a known root ("fixtures" or "private") and not an existing directory.`,
    };
  }
  if (recordMtimes) {
    return {
      kind: "usage",
      message: `--record-mtimes requires a named root ("fixtures" or "private"); "${target}" is a bare path.`,
    };
  }
  return {
    kind: "run",
    corpusRoot: { name: bareDir, corporaDir: bareDir },
    probe,
    json,
    hintsPath: undefined,
  };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether the mtime rules ran, and against what (plan merge-nx-audiobook-
 *  validation, --json gains "hints"): "loaded" (a parsed hints file backed
 *  the comparison), "missing" (named root, no hints file yet — the single
 *  mtime-hints-missing warning fired), "skipped" (bare path — not
 *  applicable, mtime rules didn't run at all). */
export type HintsStatus = "loaded" | "missing" | "skipped";

export interface RunResult {
  root: string;
  corporaDir: string;
  books: number;
  probed: boolean;
  unprobed: number;
  findings: Array<ScanFinding>;
  failures: number;
  warnings: number;
  pass: boolean;
  hints: HintsStatus;
}

export interface RunOptions {
  probe: boolean;
  probeFn?: ProbeFn;
  /** undefined (bare path): mtime rules don't run at all, not even the
   *  missing-DB warning. Defined (named root): loaded if the file parses,
   *  "missing" (hints null) if it doesn't exist yet. A malformed file throws
   *  HintsUsageError. */
  hintsPath?: string;
}

/** Thrown when a named root's mtime hints file exists but fails to parse: a
 *  usage/config error (exit 2, same family as resolvePlan's UsagePlan) —
 *  only knowable once the file is actually read, so validate.ts's top-level
 *  catch special-cases this class rather than the generic exit-1 path. */
export class HintsUsageError extends Error {}

/** Reads and JSON.parses a named root's hints file (plain JSON, no jsonc —
 *  comments can't survive --record-mtimes's programmatic rewrite). Any read
 *  failure (ENOENT or otherwise) means "missing" (bootstrap state, D3); a
 *  parse failure is a usage error naming the path. */
function loadHints(hintsPath: string): {
  hints: MtimeHints | null;
  status: HintsStatus;
} {
  let raw: string;
  try {
    raw = readFileSync(hintsPath, "utf8");
  } catch {
    return { hints: null, status: "missing" };
  }
  try {
    return { hints: JSON.parse(raw) as MtimeHints, status: "loaded" };
  } catch (error) {
    throw new HintsUsageError(
      `malformed mtime hints file "${hintsPath}": ${toMessage(error)}`,
    );
  }
}

/**
 * scanRoot, then (unless probe:false) probe every book and re-derive
 * metadata exactly like library.ts's enrich — same pLimit concurrency,
 * same extractMetadata call, same basenameFallbackFinding construction site.
 * Probe failures (durationSec staying null) are counted in `unprobed`; they
 * are never findings (a missing ffprobe binary must not fail a corpus). A
 * successful probe also feeds postProbeFindings (bad-duration,
 * metadata-missing-author) alongside the basename-fallback finding — with
 * --no-probe, these are skipped too (no probe, no probe-derived findings).
 * hygieneFindings always runs (named roots AND bare paths); mtimeFindings
 * only for named roots (options.hintsPath defined). Cache-free: nothing here
 * reads or writes any persisted index (the hints file is read-only here —
 * only --record-mtimes writes it).
 */
export async function runValidation(
  corpusRoot: CorpusRoot,
  options: RunOptions,
): Promise<RunResult> {
  const probeFn = options.probeFn ?? probeFile;
  const { books, findings } = scanRoot(corpusRoot);

  if (options.probe) {
    const limit = pLimit(PROBE_CONCURRENCY);
    await Promise.all(
      books.map((book) =>
        limit(async () => {
          const result = await probeFn(
            join(corpusRoot.corporaDir, book.m4bRelPath),
          );
          if (result.durationSec === null) return; // unprobed, not a finding
          findings.push(...postProbeFindings(book, result));
          book.metadata.durationSec = result.durationSec;
          book.metadata.bitrateKbps = result.bitrateKbps;
          book.metadata.codec = result.codec;
          const extracted = extractMetadata(result, book.basename);
          book.metadata.title = extracted.title;
          book.metadata.author = extracted.author;
          book.metadata.series = extracted.series;
          book.metadata.narrator = extracted.narrator;
          book.metadata.source = extracted.usedBasenameFallback
            ? "basename"
            : "tags";
          if (extracted.usedBasenameFallback) {
            findings.push(basenameFallbackFinding(book));
          }
        }),
      ),
    );
  }

  findings.push(...(await hygieneFindings(corpusRoot.corporaDir)));

  let hintsStatus: HintsStatus = "skipped";
  if (options.hintsPath !== undefined) {
    const loaded = loadHints(options.hintsPath);
    hintsStatus = loaded.status;
    findings.push(...mtimeFindings(books, loaded.hints, corpusRoot.corporaDir));
  }

  const unprobed = books.filter((b) => b.metadata.durationSec === null).length;
  const failures = findings.filter((f) => f.severity === "failure").length;
  const warnings = findings.length - failures;

  return {
    root: corpusRoot.name,
    corporaDir: corpusRoot.corporaDir,
    books: books.length,
    probed: options.probe,
    unprobed,
    findings,
    failures,
    warnings,
    hints: hintsStatus,
    pass: failures === 0,
  };
}

/** Human-readable render: header, findings grouped failures-first, verdict. */
export function renderHuman(result: RunResult): string {
  const lines: Array<string> = [];
  const probeStatus = result.probed
    ? `${result.books - result.unprobed} probed` +
      (result.unprobed > 0 ? `, ${result.unprobed} unprobed` : "")
    : "probe skipped";
  lines.push(
    `${result.root} (${result.corporaDir}): ${result.books} books, ${probeStatus}`,
  );

  const failures = result.findings.filter((f) => f.severity === "failure");
  const warnings = result.findings.filter((f) => f.severity === "warning");
  if (failures.length > 0 || warnings.length > 0) lines.push("");
  for (const finding of [...failures, ...warnings]) {
    lines.push(
      `  ${finding.severity.toUpperCase()} ${finding.code} "${finding.relDir}": ${finding.detail}`,
    );
  }

  lines.push("");
  lines.push(
    result.pass
      ? `PASS (0 failures, ${result.warnings} warnings)`
      : `FAIL (${result.failures} failures, ${result.warnings} warnings)`,
  );
  return lines.join("\n");
}

/** JSON render: single object, same typed findings the Corpora tab consumes
 *  (packages/corpus's ScanFinding) — no human output mixed in. */
export function renderJson(result: RunResult): string {
  return JSON.stringify(result);
}

/** Exit-code mapping (D4): 0 pass (warnings allowed), 1 failures present.
 *  Usage/config errors (exit 2) are decided at resolvePlan, not here. */
export function exitCode(result: RunResult): 0 | 1 {
  return result.pass ? 0 : 1;
}

// --- --record-mtimes -------------------------------------------------------
//
// Append-only capture for books lacking a hints entry (plan "Mtime hints
// design"): never overwrites an existing key (corrections are hand-edits),
// never touches the corpus itself (only the hints file), and writes
// atomically (temp file + rename) so a crash mid-write can't corrupt the DB.

export interface RecordedEntry {
  basename: string;
  iso: string;
}

export interface RecordMtimesResult {
  hintsPath: string;
  recorded: Array<RecordedEntry>;
  alreadyPresent: number;
}

/** Floors an epoch-ms value to whole seconds, ISO 8601 Z (mirrors
 *  packages/corpus/mtime.ts's private toIsoSeconds — too small a helper to
 *  warrant exporting that one for this single call site). */
function floorToIsoSeconds(epochMs: number): string {
  const epochSec = Math.floor(epochMs / 1000);
  return new Date(epochSec * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Sorts keys alphabetically (plan: "stable diffs" — the converted private
 *  DB may be unsorted; a --record-mtimes rewrite is one atomic pass, so
 *  re-sorting it is fine) and writes via temp-file-then-rename in the same
 *  directory, so a reader never observes a partial file. */
function writeHintsAtomic(hintsPath: string, hints: MtimeHints): void {
  const dir = dirname(hintsPath);
  mkdirSync(dir, { recursive: true });
  const sorted: MtimeHints = {};
  for (const key of Object.keys(hints).sort()) {
    sorted[key] = hints[key] as string;
  }
  const tempPath = join(dir, `.${basename(hintsPath)}.${randomUUID()}.tmp`);
  writeFileSync(tempPath, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(tempPath, hintsPath);
}

/**
 * Loads existing hints (missing file -> start from {}; a malformed file is
 * still a usage error, same as the validate path — see loadHints), scans the
 * root, and appends an entry for every book without one, derived from the
 * m4b's own fingerprint mtime (floored to seconds). Writes only when there's
 * something new to write (plan: "If nothing to record ... exit 0" — no need
 * to touch the file at all). corpusRoot is scanned but never mutated: the
 * charter fence between validation and the corpus stays intact.
 */
export async function recordMtimes(
  corpusRoot: CorpusRoot,
  hintsPath: string,
): Promise<RecordMtimesResult> {
  const existing = loadHints(hintsPath).hints ?? {};
  const { books } = scanRoot(corpusRoot);

  const merged: MtimeHints = { ...existing };
  const recorded: Array<RecordedEntry> = [];
  for (const book of books) {
    if (Object.hasOwn(merged, book.basename)) continue;
    const iso = floorToIsoSeconds(book.fingerprint.mtimeMs);
    merged[book.basename] = iso;
    recorded.push({ basename: book.basename, iso });
  }

  if (recorded.length > 0) {
    writeHintsAtomic(hintsPath, merged);
  }

  return {
    hintsPath,
    recorded,
    alreadyPresent: books.length - recorded.length,
  };
}

/** Each appended entry, then a summary line (plan: "prints each appended
 *  entry ... then a summary (N recorded, M already present)"). Always exit 0
 *  (validate.ts) — recording never fails a corpus, it only augments the DB. */
export function renderRecordMtimes(result: RecordMtimesResult): string {
  const lines: Array<string> = [];
  for (const entry of result.recorded) {
    lines.push(`recorded: ${entry.basename} ${entry.iso}`);
  }
  lines.push(
    result.recorded.length === 0
      ? `nothing to record (${result.alreadyPresent} already present)`
      : `${result.recorded.length} recorded, ${result.alreadyPresent} already present`,
  );
  return lines.join("\n");
}
