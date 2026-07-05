import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { AlignmentResult } from "@prosodio/align";

/**
 * Report writing into the private reports home (gitignored; see
 * docs/PRIVACY.md). The directory is a nested LOCAL-ONLY git repo — history
 * for regression comparison without publication (exemplar:
 * apps/epub-validate/reports/). Regeneration deletes stale generated files
 * but must always preserve the nested `.git`.
 */

/** Create the reports dir and its nested local-only git repo if missing. */
export function ensureReportsRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, ".git"))) {
    const init = Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
    if (init.exitCode !== 0) {
      throw new Error(`git init failed in ${dir}`);
    }
  }
}

/** Delete every report entry except the nested `.git` (full regeneration). */
export function cleanReports(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === ".git") continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

/** reports/<root>/<base>.alignment.json */
export function writeBookReport(dir: string, result: AlignmentResult): string {
  const rootDir = join(dir, result.source.root);
  mkdirSync(rootDir, { recursive: true });
  const path = join(rootDir, `${result.source.base}.alignment.json`);
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  return path;
}

export interface RunSummaryBook {
  root: string;
  base: string;
  spans: number;
  vttCoverage: number;
  epubCoverage: number;
  anomalies: number;
  warnings: number;
}

export interface RunSummary {
  books: RunSummaryBook[];
  exclusions: { root: string; kind: string; base: string }[];
  search: string | null;
}

/** reports/summary.json — the run-level view (no wall-clock values). */
export function writeRunSummary(dir: string, summary: RunSummary): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "summary.json");
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`);
  return path;
}

export function summarizeBook(result: AlignmentResult): RunSummaryBook {
  return {
    root: result.source.root,
    base: result.source.base,
    spans: result.spans.length,
    vttCoverage: result.metrics.vttCoverage,
    epubCoverage: result.metrics.epubCoverage,
    anomalies: result.metrics.anomalies.length,
    warnings: result.metrics.warnings.length,
  };
}
