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
 */
import { statSync } from "node:fs";
import { join, resolve } from "node:path";

import pLimit from "p-limit";

import { resolveRoot, resolveRoots } from "@prosodio/config";
import {
  basenameFallbackFinding,
  extractMetadata,
  probeFile,
  scanRoot,
} from "@prosodio/corpus";
import type { CorpusRoot, ProbeFn, ScanFinding } from "@prosodio/corpus";

export const USAGE =
  "usage: validate <fixtures|private|path> [--no-probe] [--json]";

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
}

export type Plan = UsagePlan | RunPlan;

/**
 * Parses argv and resolves the positional argument to a scannable root: a
 * named root (fixtures/private, via @prosodio/config's resolveRoot — reused
 * so the missing-directory/env-override messages can't drift from the rest
 * of the codebase) or a bare existing-directory path (read-only, no
 * transcriptionsDir — vtt reads "absent"). Any failure here is a
 * usage/config error (exit 2, D4).
 */
export function resolvePlan(
  argv: ReadonlyArray<string>,
  repoRoot: string,
  env: Record<string, string | undefined>,
): Plan {
  let target: string | undefined;
  let probe = true;
  let json = false;

  for (const arg of argv) {
    if (arg === "--no-probe") {
      probe = false;
    } else if (arg === "--json") {
      json = true;
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
      return { kind: "run", corpusRoot, probe, json };
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
  return {
    kind: "run",
    corpusRoot: { name: bareDir, corporaDir: bareDir },
    probe,
    json,
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
}

export interface RunOptions {
  probe: boolean;
  probeFn?: ProbeFn;
}

/**
 * scanRoot, then (unless probe:false) probe every book and re-derive
 * metadata exactly like library.ts's enrich — same pLimit concurrency,
 * same extractMetadata call, same basenameFallbackFinding construction site.
 * Probe failures (durationSec staying null) are counted in `unprobed`; they
 * are never findings (a missing ffprobe binary must not fail a corpus).
 * Cache-free: nothing here reads or writes any persisted index.
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
