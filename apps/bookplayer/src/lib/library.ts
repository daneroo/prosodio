/**
 * Library index lifecycle, reconciliation style: restore the persisted cache
 * and serve immediately, then revalidate; a scan re-walks the root (cheap)
 * and reuses probed metadata wherever the m4b fingerprint is unchanged, so
 * only new/changed books hit ffprobe (bounded concurrency, background).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import pLimit from "p-limit";

import { probeFile } from "./ffprobe.ts";
import { scanRoot } from "./scan.ts";
import type { BookplayerConfig } from "./config.ts";
import type { ProbeFn } from "./ffprobe.ts";
import type {
  BookCache,
  BookRecord,
  LibraryIndex,
  ScanFinding,
} from "./types.ts";

export interface Library {
  getIndex: () => LibraryIndex;
  getBook: (id: string) => BookRecord | undefined;
  /** Re-scan now; returns false when a scan is already running. */
  refresh: () => boolean;
  isScanning: () => boolean;
}

export function createLibrary(
  config: BookplayerConfig,
  probe: ProbeFn = probeFile,
): Library {
  let index: LibraryIndex | null = null;
  let scanning = false;

  function scanNow(): LibraryIndex {
    if (scanning && index) return index;
    scanning = true;
    try {
      const started = performance.now();
      const previous = index;
      const { books, findings } = scanRoot(config.activeRoot);
      carryOverMetadata(books, previous?.books ?? []);
      const scanDurationMs = Math.round(performance.now() - started);
      index = {
        rootName: config.activeRoot.name,
        books,
        findings,
        scannedAt: new Date().toISOString(),
        scanDurationMs,
      };
      console.log(
        `[scan] root=${index.rootName} books=${books.length} findings=${findings.length} in ${scanDurationMs}ms`,
      );
      persistCache(config.cacheFile, index);
      void enrich(index);
      return index;
    } finally {
      scanning = false;
    }
  }

  async function enrich(target: LibraryIndex): Promise<void> {
    const pending = target.books.filter((b) => b.metadata.durationSec === null);
    if (pending.length === 0) return;
    const started = performance.now();
    const limit = pLimit(config.ffprobeConcurrency);
    await Promise.all(
      pending.map((book) =>
        limit(async () => {
          const result = await probe(
            join(config.activeRoot.corporaDir, book.m4bRelPath),
          );
          if (result.durationSec === null) return;
          book.metadata.durationSec = result.durationSec;
          book.metadata.bitrateKbps = result.bitrateKbps;
          book.metadata.codec = result.codec;
          // The curated m4b tags are the canonical source for title/author
          // (the private corpus is 100% clean on both — verified
          // 2026-07-19). scan.ts seeds provisional basename values; the tags
          // overwrite them per-field when present, and the basename survives
          // only as a fallback for a missing tag. The Alice FIXTURE's junk
          // title tag ("AliceWonderland8_librivox") misled the original
          // basename-first logic — it is a pathological example, not the
          // rule. Fuller correction (series/narrator, a finding when the
          // fallback fires, a dedicated extractor) is tracked as
          // metadata-canonical-from-tags in thoughts/BACKLOG.md and
          // docs/corpora/metadata.md.
          if (result.titleTag) book.metadata.title = result.titleTag;
          if (result.artistTag) book.metadata.author = result.artistTag;
        }),
      ),
    );
    const elapsed = Math.round(performance.now() - started);
    console.log(
      `[probe] probed=${pending.length} concurrency=${config.ffprobeConcurrency} in ${elapsed}ms`,
    );
    // A rescan may have replaced the index while probes ran; only the
    // current index is persisted (stale enrichment mutated orphaned rows).
    if (index === target) persistCache(config.cacheFile, target);
  }

  return {
    getIndex: () => {
      if (index) return index;
      const restored = restoreCache(config);
      if (restored) {
        index = restored;
        console.log(
          `[scan] restored ${restored.books.length} books from cache (${restored.scannedAt}); revalidating`,
        );
        queueMicrotask(scanNow);
        return index;
      }
      return scanNow();
    },
    getBook: (id) => {
      if (!index) return undefined;
      return index.books.find((b) => b.id === id);
    },
    refresh: () => {
      if (scanning) return false;
      scanNow();
      return true;
    },
    isScanning: () => scanning,
  };
}

// CACHE

function restoreCache(config: BookplayerConfig): LibraryIndex | null {
  // Parsed as a loose shape, not BookCache: the file on disk may be from any
  // older version, so the version/root guards must stay real checks.
  let cache: Partial<Record<keyof BookCache, unknown>>;
  try {
    cache = JSON.parse(readFileSync(config.cacheFile, "utf8")) as Partial<
      Record<keyof BookCache, unknown>
    >;
  } catch {
    return null;
  }
  if (
    // Older caches predate schema/semantic changes (v2: typed findings +
    // graded match quality; v3: title/author sourced from tags, not the
    // basename). The version bump is the intended invalidation — an
    // unchanged fingerprint would otherwise keep stale metadata via
    // carryOverMetadata, so a full rescan/re-probe is required, not a
    // field-by-field migration.
    cache.version !== 3 ||
    cache.rootName !== config.activeRoot.name ||
    !Array.isArray(cache.books)
  ) {
    return null;
  }
  return {
    rootName: config.activeRoot.name,
    books: cache.books as Array<LibraryIndex["books"][number]>,
    findings: Array.isArray(cache.findings)
      ? (cache.findings as Array<ScanFinding>)
      : [],
    scannedAt: typeof cache.scannedAt === "string" ? cache.scannedAt : "",
    scanDurationMs: 0,
  };
}

function persistCache(cacheFile: string, index: LibraryIndex): void {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    const cache: BookCache = {
      version: 3,
      rootName: index.rootName,
      scannedAt: index.scannedAt,
      books: index.books,
      findings: index.findings,
    };
    writeFileSync(cacheFile, JSON.stringify(cache), "utf8");
  } catch (error) {
    console.warn(`[scan] cache persist failed: ${String(error)}`);
  }
}

/** Fingerprint-gated reuse: unchanged m4b ⇒ keep probed metadata. */
function carryOverMetadata(
  books: Array<BookRecord>,
  previous: Array<BookRecord>,
): void {
  if (previous.length === 0) return;
  const byId = new Map(previous.map((b) => [b.id, b]));
  for (const book of books) {
    const before = byId.get(book.id);
    if (
      before &&
      before.fingerprint.relPath === book.fingerprint.relPath &&
      before.fingerprint.mtimeMs === book.fingerprint.mtimeMs &&
      before.fingerprint.size === book.fingerprint.size &&
      before.metadata.durationSec !== null
    ) {
      book.metadata = { ...before.metadata };
    }
  }
}

// SINGLETON (server runtime; tests use createLibrary directly)

let instance: Library | null = null;

export function getLibrary(config: BookplayerConfig): Library {
  instance ??= createLibrary(config);
  return instance;
}
