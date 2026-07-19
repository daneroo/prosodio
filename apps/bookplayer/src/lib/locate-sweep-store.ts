/**
 * Server-side persistence for L3 locate sweeps (plan
 * thoughts/plans/bookplayer-locate-hardening.md, T2.1; decisions H4/H5;
 * report schema v2 added by thoughts/plans/lab-routes-refined.md, S5). Reports
 * are written whole as `<bookId>.locate-sweep.json` under
 * `data/bookplayer/cache/` — wall-clock `generatedAt` is fine here
 * (diagnostics, not a determinism-contract artifact). `SweepReport` is
 * imported type-only so this module (and its handlers) never pull epubjs or
 * any other browser-only value into a server module graph — see
 * locate-sweep.ts's own module doc for why that file stays browser-only.
 *
 * v2 on-disk shape nests one run per SweepSource ("matched" | "all") under a
 * single per-book file: `{ version: 2, bookId, runs: { matched?, all? } }`.
 * Writing one source's run PRESERVES the other source's run already on disk
 * (readSweepFile -> merge -> write whole). Any file without `version: 2` —
 * i.e. every pre-S5 v1 file (`{ generatedAt, report }`) — reads as ABSENT:
 * no migration, no error. A version bump is cache invalidation, not a
 * compat promise (D10); the sweep re-runs cheaply from the browser.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { BookplayerConfig } from "./config.ts";
import type { SweepReport, SweepSource } from "./locate-sweep.ts";

/** One source's stored run — same information v1 stored for its single
 * report, now nested per source inside StoredSweepFile. */
export interface StoredSweepRun {
  generatedAt: string;
  report: SweepReport;
}

export interface StoredSweepFile {
  version: 2;
  bookId: string;
  runs: Partial<Record<SweepSource, StoredSweepRun>>;
}

export function sweepPath(config: BookplayerConfig, bookId: string): string {
  return join(config.dataDir, "cache", `${bookId}.locate-sweep.json`);
}

/** Structural totals check shared by readSweepFile and validateSweepBody:
 * every field numeric, nothing more assumed. */
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

function sweepSourceOk(value: unknown): value is SweepSource {
  return value === "matched" || value === "all";
}

function sweepReportShapeOk(value: unknown): value is SweepReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as Partial<SweepReport>;
  return (
    typeof report.bookId === "string" &&
    sweepSourceOk(report.source) &&
    totalsShapeOk(report.totals) &&
    Array.isArray(report.sections) &&
    report.sections.length === report.totals.sections
  );
}

function storedSweepRunShapeOk(value: unknown): value is StoredSweepRun {
  if (typeof value !== "object" || value === null) return false;
  const stored = value as Partial<StoredSweepRun>;
  return (
    typeof stored.generatedAt === "string" && sweepReportShapeOk(stored.report)
  );
}

function storedSweepFileShapeOk(value: unknown): value is StoredSweepFile {
  if (typeof value !== "object" || value === null) return false;
  // Deliberately widened to Record<string, unknown> rather than
  // Partial<StoredSweepFile> — casting straight to the target type would
  // make TS trust `runs` is already object-shaped, defeating the runtime
  // check below (this is why eslint flags "unnecessary conditional" on the
  // narrower cast).
  const file = value as Record<string, unknown>;
  if (file.version !== 2 || typeof file.bookId !== "string") return false;
  const runsValue = file.runs;
  if (typeof runsValue !== "object" || runsValue === null) return false;
  for (const [source, run] of Object.entries(
    runsValue as Record<string, unknown>,
  )) {
    if (!sweepSourceOk(source)) return false;
    if (run !== undefined && !storedSweepRunShapeOk(run)) return false;
  }
  return true;
}

/** Missing file, corrupt JSON, JSON that doesn't structurally look like a
 * StoredSweepFile, or a pre-S5 v1 file (no `version: 2`) all read as null —
 * never throws. */
export function readSweepFile(path: string): StoredSweepFile | null {
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
  return storedSweepFileShapeOk(parsed) ? parsed : null;
}

/** One source's stored run, or null if that source has never been swept (or
 * the file is absent/v1/corrupt). Convenience wrapper over readSweepFile for
 * the common single-source read. */
export function readSweep(
  path: string,
  source: SweepSource,
): StoredSweepRun | null {
  return readSweepFile(path)?.runs[source] ?? null;
}

/** Wraps the report with a fresh generatedAt and writes it back into the
 * file's `runs[report.source]` slot, preserving any other source's run
 * already on disk (readSweepFile -> merge -> write whole; a v1 or corrupt
 * file on disk reads as absent per readSweepFile, so it's silently replaced
 * rather than merged into). mkdir -p's the cache dir, writes compact JSON
 * (sweep files run ~1 MB+; no pretty-printing, same call as
 * artifact-cache.ts). */
export function writeSweep(
  path: string,
  bookId: string,
  report: SweepReport,
): StoredSweepRun {
  const existing = readSweepFile(path);
  const run: StoredSweepRun = {
    generatedAt: new Date().toISOString(),
    report,
  };
  const file: StoredSweepFile = {
    version: 2,
    bookId,
    runs: { ...existing?.runs, [report.source]: run },
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file));
  return run;
}

/**
 * Structural sanity for a PUT body, not a full schema: confirms it's a
 * SweepReport (with a valid `source`) for the requested book with
 * self-consistent totals/sections. Callers must enforce a body size cap
 * BEFORE parsing JSON (see handlers/locate-sweep.ts) — this function assumes
 * `body` is already parsed.
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
  if (!sweepSourceOk(candidate.source)) {
    return {
      ok: false,
      reason: `source must be "matched" or "all", got ${JSON.stringify(candidate.source)}`,
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
 * Per-book, per-source totals summary of every stored sweep in the cache
 * dir, sorted by bookId. Never ships per-section detail — that lives behind
 * GET /api/locate-sweep/:bookId. Missing cache dir (nothing swept yet) reads
 * as empty, not an error. A v1 file (or anything else readSweepFile refuses)
 * is silently skipped, same as a corrupt one.
 */
export function sweepIndex(config: BookplayerConfig): Array<{
  bookId: string;
  runs: Partial<
    Record<SweepSource, { generatedAt: string; totals: SweepReport["totals"] }>
  >;
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
    runs: Partial<
      Record<
        SweepSource,
        { generatedAt: string; totals: SweepReport["totals"] }
      >
    >;
  }> = [];
  for (const entry of entries) {
    const match = SWEEP_FILE_RE.exec(entry);
    const bookId = match?.[1];
    if (!bookId) continue;
    const file = readSweepFile(join(dir, entry));
    if (!file) continue;
    const runs: (typeof index)[number]["runs"] = {};
    for (const [source, run] of Object.entries(file.runs)) {
      runs[source as SweepSource] = {
        generatedAt: run.generatedAt,
        totals: run.report.totals,
      };
    }
    index.push({ bookId, runs });
  }
  index.sort((a, b) => a.bookId.localeCompare(b.bookId));
  return index;
}
