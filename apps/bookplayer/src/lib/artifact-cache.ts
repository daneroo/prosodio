/**
 * AlignmentArtifact v2 disk cache (plan
 * thoughts/plans/bookplayer-align-refine-model.md, T3.1). The artifact is
 * pure servable bytes (JSON + a gzip twin) written once, keyed by schema
 * version + source mtimes, alongside a small staleness sidecar.
 * @prosodio/align is imported dynamically so jsdom never enters a client
 * module graph.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { assetPath } from "./media.ts";
import type { BookplayerConfig } from "./config.ts";
import type { BookRecord } from "./types.ts";

export interface ArtifactCacheKey {
  schemaVersion: number;
  vttMtimeMs: number;
  epubMtimeMs: number;
}

export interface ArtifactPaths {
  json: string;
  gz: string;
  key: string;
}

interface KeySidecar {
  key: ArtifactCacheKey;
}

export function artifactPaths(
  config: BookplayerConfig,
  bookId: string,
): ArtifactPaths {
  const dir = join(config.dataDir, "cache");
  return {
    json: join(dir, `${bookId}.alignment.json`),
    gz: join(dir, `${bookId}.alignment.json.gz`),
    key: join(dir, `${bookId}.alignment.key.json`),
  };
}

/** Stat mtimes for the cache key; schemaVersion is supplied by the caller
 * (kept out of this module so it never statically imports @prosodio/align —
 * see loadOrComputeArtifact's dynamic import). */
export function artifactKey(
  vttPath: string,
  epubPath: string,
  schemaVersion: number,
): ArtifactCacheKey {
  return {
    schemaVersion,
    vttMtimeMs: statSync(vttPath).mtimeMs,
    epubMtimeMs: statSync(epubPath).mtimeMs,
  };
}

/** true only when the sidecar parses and every field matches exactly, and
 * the artifact json file exists. Never throws — any failure reads as stale. */
export function isArtifactFresh(
  paths: ArtifactPaths,
  key: ArtifactCacheKey,
): boolean {
  let parsed: Partial<KeySidecar>;
  try {
    parsed = JSON.parse(readFileSync(paths.key, "utf8")) as Partial<KeySidecar>;
  } catch {
    return false;
  }
  const cached = parsed.key;
  if (
    cached?.schemaVersion !== key.schemaVersion ||
    cached.vttMtimeMs !== key.vttMtimeMs ||
    cached.epubMtimeMs !== key.epubMtimeMs
  ) {
    return false;
  }
  try {
    statSync(paths.json);
  } catch {
    return false;
  }
  return true;
}

/** Writes all three cache files (json, gz twin, key sidecar); mkdir -p. */
export function writeArtifactCache(
  paths: ArtifactPaths,
  key: ArtifactCacheKey,
  artifactJson: string,
): void {
  mkdirSync(dirname(paths.json), { recursive: true });
  const bytes = Buffer.from(artifactJson);
  writeFileSync(paths.json, bytes);
  writeFileSync(paths.gz, Bun.gzipSync(bytes));
  writeFileSync(paths.key, JSON.stringify({ key } satisfies KeySidecar));
}

export type ComputeArtifact = (
  vttPath: string,
  epubPath: string,
  source: { root: string; base: string },
) => Promise<string>;

async function defaultCompute(
  vttPath: string,
  epubPath: string,
  source: { root: string; base: string },
): Promise<string> {
  const align = await import("@prosodio/align");
  const started = performance.now();
  const vttText = readFileSync(vttPath, "utf8");
  const epubBytes = await Bun.file(epubPath).arrayBuffer();
  const alignment = await align.alignBook(vttText, epubBytes);
  const artifact = align.buildAlignmentArtifact(alignment, source);
  console.log(
    `[align] ${source.base}: spans=${artifact.match.metrics.spanCount} in ${(performance.now() - started).toFixed(0)}ms (artifact v2)`,
  );
  return JSON.stringify(artifact);
}

// Single-flight: concurrent requests for the same book share one in-flight
// compute rather than racing the engine twice.
const inflight = new Map<
  string,
  Promise<{ paths: ArtifactPaths; key: ArtifactCacheKey }>
>();

/**
 * The book's artifact cache entry: fresh from disk, or computed and
 * written through. null = book lacks a vtt or epub.
 */
export async function loadOrComputeArtifact(
  config: BookplayerConfig,
  book: BookRecord,
  compute: ComputeArtifact = defaultCompute,
): Promise<{ paths: ArtifactPaths; key: ArtifactCacheKey } | null> {
  const vttPath = assetPath(config, book, "vtt");
  const epubPath = assetPath(config, book, "epub");
  if (!vttPath || !epubPath) return null;

  // schemaVersion always comes from the dynamically imported package (never
  // a static value-import here) — the injectable `compute` seam only
  // replaces the expensive alignBook step, not the version lookup.
  const align = await import("@prosodio/align");
  const key = artifactKey(
    vttPath,
    epubPath,
    align.ALIGNMENT_ARTIFACT_SCHEMA_VERSION,
  );
  const paths = artifactPaths(config, book.id);
  if (isArtifactFresh(paths, key)) return { paths, key };

  const existing = inflight.get(book.id);
  if (existing) return existing;

  const promise = (async () => {
    const artifactJson = await compute(vttPath, epubPath, {
      root: config.activeRoot.name,
      base: book.basename,
    });
    writeArtifactCache(paths, key, artifactJson);
    return { paths, key };
  })();
  inflight.set(book.id, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(book.id);
  }
}
