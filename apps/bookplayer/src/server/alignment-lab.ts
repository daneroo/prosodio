/**
 * Server functions: the /lab/alignment data plane (plan
 * thoughts/plans/lab-routes-refined.md, S4a; decisions D3/D4/D9/D10).
 *
 * D3 note: there is no metrics computation here. vttCoverage, epubCoverage,
 * spanCount, and gapCount are already computed once, at align time, into
 * every artifact's `match.metrics` (packages/align/src/metrics.ts) — the
 * player's AlignmentViewer reads that same field
 * (`prepared.artifact.match.metrics`, src/components/AlignmentViewer.tsx).
 * This module only plucks that lean 4-field projection from cached artifact
 * JSON; it never invokes the aligner.
 *
 * D4 note: cache presence, size, age, and schema version are always visible
 * — a null `cache` IS the answer to "is this cached", not a placeholder.
 * Per-book and clear-all eviction are one call away.
 */
import { readFileSync, rmSync, statSync } from "node:fs";

import { createServerFn } from "@tanstack/react-start";

import { artifactPaths } from "#/lib/artifact-cache";
import { getConfig } from "#/lib/config";
import { getLibrary } from "#/lib/library";
import { BOOK_ID_RE } from "#/lib/media";
import type { BookRecord } from "@prosodio/corpus";
import type { ArtifactCacheKey } from "#/lib/artifact-cache";
import type { BookplayerConfig } from "#/lib/config";

/** Lean 4-field projection of packages/align's much larger
 *  `AlignmentMetrics` (metrics.ts) — the only fields a list row needs (D9
 *  payload discipline: 1000 rows must stay cheap). */
export interface AlignmentListMetrics {
  vttCoverage: number;
  epubCoverage: number;
  spanCount: number;
  gapCount: number;
}

export interface AlignmentCacheInfo {
  bytes: number;
  mtimeMs: number;
  /** null when the key sidecar is missing or corrupt — never thrown. */
  schemaVersion: number | null;
  /** null when match.metrics is missing/malformed in an otherwise-present
   *  artifact file — "unreadable artifact", not a crash (see
   *  lab.alignment.index.tsx's rose note). */
  metrics: AlignmentListMetrics | null;
}

export interface AlignmentRow {
  id: string;
  title: string;
  author: string | null;
  /** null when `<bookId>.alignment.json` does not exist on disk. */
  cache: AlignmentCacheInfo | null;
}

function validBookId(bookId: string): string {
  if (typeof bookId !== "string" || !BOOK_ID_RE.test(bookId)) {
    throw new Error("Invalid book id.");
  }
  return bookId;
}

const library = () => getLibrary(getConfig());

/** Eligible pairs: alignment requires both an epub and an exact-match vtt —
 *  same predicate as lab.locate.index.tsx's row filter. */
function eligibleBooks(): Array<BookRecord> {
  return library()
    .getIndex()
    .books.filter((book) => book.epubRelPath !== null && book.hasVtt);
}

// Memoized artifact parse, keyed by bookId and invalidated whenever the
// json file's mtimeMs changes. Artifacts run multiple MB each; without this
// the index would re-JSON.parse every cached book on every request (D9: the
// index must stay usable against ~1000 books, ~100 of them cached today).
interface MetricsMemoEntry {
  mtimeMs: number;
  metrics: AlignmentListMetrics | null;
}
const metricsMemo = new Map<string, MetricsMemoEntry>();

/** Structural pluck, not a schema parse — any shape miss reads as null
 *  rather than throwing (a corrupt/truncated artifact must render as
 *  "unreadable", never 500 the whole list). */
function pluckMetrics(raw: string): AlignmentListMetrics | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const metrics = (parsed as { match?: { metrics?: unknown } }).match
    ?.metrics as Partial<AlignmentListMetrics> | undefined;
  if (
    typeof metrics?.vttCoverage !== "number" ||
    typeof metrics.epubCoverage !== "number" ||
    typeof metrics.spanCount !== "number" ||
    typeof metrics.gapCount !== "number"
  ) {
    return null;
  }
  return {
    vttCoverage: metrics.vttCoverage,
    epubCoverage: metrics.epubCoverage,
    spanCount: metrics.spanCount,
    gapCount: metrics.gapCount,
  };
}

function readMetrics(
  jsonPath: string,
  mtimeMs: number,
  bookId: string,
): AlignmentListMetrics | null {
  const cached = metricsMemo.get(bookId);
  if (cached && cached.mtimeMs === mtimeMs) return cached.metrics;

  let metrics: AlignmentListMetrics | null;
  try {
    metrics = pluckMetrics(readFileSync(jsonPath, "utf8"));
  } catch {
    metrics = null;
  }
  metricsMemo.set(bookId, { mtimeMs, metrics });
  return metrics;
}

/** null-safe: a missing or corrupt key sidecar just means "version
 *  unknown", not an error. */
function readSchemaVersion(keyPath: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(keyPath, "utf8")) as {
      key?: Partial<ArtifactCacheKey>;
    };
    const version = parsed.key?.schemaVersion;
    return typeof version === "number" ? version : null;
  } catch {
    return null;
  }
}

function cacheInfo(
  config: BookplayerConfig,
  bookId: string,
): AlignmentCacheInfo | null {
  const paths = artifactPaths(config, bookId);
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(paths.json);
  } catch {
    return null;
  }
  return {
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
    schemaVersion: readSchemaVersion(paths.key),
    metrics: readMetrics(paths.json, stat.mtimeMs, bookId),
  };
}

function toRow(config: BookplayerConfig, book: BookRecord): AlignmentRow {
  return {
    id: book.id,
    title: book.metadata.title,
    author: book.metadata.author,
    cache: cacheInfo(config, book.id),
  };
}

/** The list page's one data source: every eligible pair plus whatever the
 *  cache currently says about it. Never computes — see module doc. */
export const fetchAlignmentIndex = createServerFn({ method: "GET" }).handler(
  () => {
    const config = getConfig();
    const rows = eligibleBooks()
      .map((book) => toRow(config, book))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { pairs: rows.length, rows };
  },
);

function evictFiles(config: BookplayerConfig, bookId: string): void {
  const paths = artifactPaths(config, bookId);
  rmSync(paths.json, { force: true });
  rmSync(paths.gz, { force: true });
  rmSync(paths.key, { force: true });
  metricsMemo.delete(bookId);
}

/** Evicts one book's artifact (json + gz + key sidecar). Never touches
 *  `<bookId>.locate-sweep.json`, which lives in the same cache dir but is a
 *  separate artifact (plan explicitly forbids crossing that line). Returns
 *  the refreshed row so the page can update in place without a full
 *  refetch, though it refetches anyway for simplicity. */
export const evictAlignmentArtifact = createServerFn({ method: "POST" })
  .validator(validBookId)
  .handler(({ data: bookId }) => {
    const config = getConfig();
    evictFiles(config, bookId);
    const book = library().getBook(bookId);
    return book ? toRow(config, book) : null;
  });

/** Evicts every eligible book's artifact. Iterates the eligible-pairs list
 *  (not a directory sweep), so it structurally cannot touch locate-sweep
 *  files. */
export const clearAlignmentArtifacts = createServerFn({
  method: "POST",
}).handler(() => {
  const config = getConfig();
  const books = eligibleBooks();
  let count = 0;
  for (const book of books) {
    // A cheap existence check, not the full cacheInfo parse — clearing
    // ~1000 books must not re-JSON.parse each artifact just to count it.
    try {
      statSync(artifactPaths(config, book.id).json);
      count++;
    } catch {
      // not cached — nothing to count or remove
    }
    evictFiles(config, book.id);
  }
  return { count };
});
