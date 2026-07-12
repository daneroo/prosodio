/**
 * Server-side persistence for L3 locate sweeps (plan
 * thoughts/plans/bookplayer-locate-hardening.md, T2.1; decisions H4/H5).
 * Reports are written whole as `<bookId>.locate-sweep.json` under
 * `data/bookplayer/cache/` — wall-clock `generatedAt` is fine here
 * (diagnostics, not a determinism-contract artifact). `SweepReport` is
 * imported type-only so this module (and its handlers) never pull epubjs or
 * any other browser-only value into a server module graph — see
 * locate-sweep.ts's own module doc for why that file stays browser-only.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { BookplayerConfig } from "./config.ts";
import type { SweepReport } from "./locate-sweep.ts";

export interface StoredSweep {
  generatedAt: string;
  report: SweepReport;
}

export function sweepPath(config: BookplayerConfig, bookId: string): string {
  return join(config.dataDir, "cache", `${bookId}.locate-sweep.json`);
}

/** Structural totals check shared by readSweep and validateSweepBody: every
 * field numeric, nothing more assumed. */
function totalsShapeOk(value: unknown): value is SweepReport["totals"] {
  if (typeof value !== "object" || value === null) return false;
  const totals = value as Partial<SweepReport["totals"]>;
  return (
    typeof totals.sections === "number" &&
    typeof totals.tokens === "number" &&
    typeof totals.ok === "number" &&
    typeof totals.failed === "number"
  );
}

function sweepReportShapeOk(value: unknown): value is SweepReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Partial<SweepReport>;
  return (
    typeof report.bookId === "string" &&
    totalsShapeOk(report.totals) &&
    Array.isArray(report.sections) &&
    report.sections.length === report.totals.sections
  );
}

function storedSweepShapeOk(value: unknown): value is StoredSweep {
  if (typeof value !== "object" || value === null) return false;
  const stored = value as Partial<StoredSweep>;
  return (
    typeof stored.generatedAt === "string" && sweepReportShapeOk(stored.report)
  );
}

/** Missing file, corrupt JSON, or JSON that doesn't structurally look like a
 * StoredSweep all read as null — never throws. */
export function readSweep(path: string): StoredSweep | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return storedSweepShapeOk(parsed) ? parsed : null;
}

/** Wraps the report with a fresh generatedAt, mkdir -p's the cache dir, and
 * writes compact JSON (sweep files run ~1 MB+; no pretty-printing, same call
 * as artifact-cache.ts). */
export function writeSweep(path: string, report: SweepReport): StoredSweep {
  const stored: StoredSweep = {
    generatedAt: new Date().toISOString(),
    report,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(stored));
  return stored;
}

/**
 * Structural sanity for a PUT body, not a full schema: confirms it's a
 * SweepReport for the requested book with self-consistent totals/sections.
 * Callers must enforce a body size cap BEFORE parsing JSON (see
 * handlers/locate-sweep.ts) — this function assumes `body` is already parsed.
 */
export function validateSweepBody(
  bookId: string,
  body: unknown,
): { ok: true; report: SweepReport } | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, reason: "body must be a JSON object" };
  }
  const candidate = body as Partial<SweepReport>;

  if (candidate.bookId !== bookId) {
    return {
      ok: false,
      reason: `bookId mismatch: expected "${bookId}", got ${JSON.stringify(candidate.bookId)}`,
    };
  }
  if (!totalsShapeOk(candidate.totals)) {
    return {
      ok: false,
      reason: "totals must have numeric sections/tokens/ok/failed",
    };
  }
  if (!Array.isArray(candidate.sections)) {
    return { ok: false, reason: "sections must be an array" };
  }
  if (candidate.sections.length !== candidate.totals.sections) {
    return {
      ok: false,
      reason: `sections length ${candidate.sections.length} does not match totals.sections ${candidate.totals.sections}`,
    };
  }

  return { ok: true, report: candidate as SweepReport };
}

const SWEEP_FILE_RE = /^(.+)\.locate-sweep\.json$/;

/**
 * Totals-only summary of every stored sweep in the cache dir, sorted by
 * bookId. Never ships per-section detail — that lives behind
 * GET /api/locate-sweep/:bookId. Missing cache dir (nothing swept yet) reads as
 * empty, not an error.
 */
export function sweepIndex(config: BookplayerConfig): Array<{
  bookId: string;
  generatedAt: string;
  totals: SweepReport["totals"];
}> {
  const dir = join(config.dataDir, "cache");
  let entries: Array<string>;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const index: Array<{
    bookId: string;
    generatedAt: string;
    totals: SweepReport["totals"];
  }> = [];
  for (const entry of entries) {
    const match = SWEEP_FILE_RE.exec(entry);
    const bookId = match?.[1];
    if (!bookId) continue;
    const stored = readSweep(join(dir, entry));
    if (!stored) continue;
    index.push({
      bookId,
      generatedAt: stored.generatedAt,
      totals: stored.report.totals,
    });
  }
  index.sort((a, b) => a.bookId.localeCompare(b.bookId));
  return index;
}
