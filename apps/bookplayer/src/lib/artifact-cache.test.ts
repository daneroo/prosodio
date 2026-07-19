import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  artifactKey,
  artifactPaths,
  isArtifactFresh,
  loadOrComputeArtifact,
  writeArtifactCache,
} from "./artifact-cache.ts";
import type { ArtifactCacheKey, ComputeArtifact } from "./artifact-cache.ts";
import type { BookplayerConfig } from "./config.ts";
import type { BookRecord } from "./types.ts";

const tempDirs: Array<string> = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/**
 * Minimal fake config + book, with real files on disk: assetPath's
 * safeResolve realpath's both the root dir and the target file, so both
 * must actually exist (see media.ts). `hasVtt`/`epubRelPath` overrides let
 * tests exercise the "asset missing" branches.
 */
function fakeBook(
  overrides: { hasVtt?: boolean; epubRelPath?: string | null } = {},
): { config: BookplayerConfig; book: BookRecord } {
  const repoRoot = tempDir("bookplayer-artifact-root-");
  const corporaDir = tempDir("bookplayer-artifact-corpora-");
  const transcriptionsDir = tempDir("bookplayer-artifact-vtt-");
  const dataDir = tempDir("bookplayer-artifact-data-");

  const basename = "test-book";
  writeFileSync(join(transcriptionsDir, `${basename}.vtt`), "WEBVTT\n");
  writeFileSync(join(corporaDir, "test-book.epub"), "fake epub bytes");

  const config: BookplayerConfig = {
    repoRoot,
    activeRoot: { name: "fixtures", corporaDir, transcriptionsDir },
    dataDir,
    cacheFile: join(dataDir, "cache", "index.json"),
    evidenceDir: join(dataDir, "evidence"),
    ffprobeConcurrency: 4,
  };

  const book: BookRecord = {
    id: "abc123def456",
    basename,
    rootName: "fixtures",
    relDir: ".",
    m4bRelPath: "test-book.m4b",
    coverRelPath: "cover.jpg",
    epubRelPath:
      "epubRelPath" in overrides
        ? (overrides.epubRelPath ?? null)
        : "test-book.epub",
    epubMatch:
      "epubRelPath" in overrides && overrides.epubRelPath === null
        ? "absent"
        : "exact",
    hasVtt: overrides.hasVtt ?? true,
    vttMatch: (overrides.hasVtt ?? true) ? "exact" : "absent",
    metadata: {
      title: "Test Book",
      author: null,
      series: [],
      narrator: null,
      source: "pending",
      durationSec: null,
      bitrateKbps: null,
      codec: null,
      sizeBytes: 0,
    },
    fingerprint: { relPath: "test-book.m4b", mtimeMs: 0, size: 0 },
  };

  return { config, book };
}

// realpath'ed: assetPath's safeResolve realpath's both the root and the
// target (macOS symlinks /tmp -> /private/tmp), so raw joins would not match.
function vttPathOf(config: BookplayerConfig): string {
  return realpathSync(
    join(config.activeRoot.transcriptionsDir, "test-book.vtt"),
  );
}

function epubPathOf(config: BookplayerConfig): string {
  return realpathSync(join(config.activeRoot.corporaDir, "test-book.epub"));
}

describe("writeArtifactCache / isArtifactFresh", () => {
  test("write-through then fresh read round-trips; gz decompresses to the exact json bytes", () => {
    const { config } = fakeBook();
    const paths = artifactPaths(config, "abc123def456");
    const key: ArtifactCacheKey = {
      schemaVersion: 2,
      vttMtimeMs: 1000,
      epubMtimeMs: 2000,
    };
    const artifactJson = JSON.stringify({ hello: "world" });

    writeArtifactCache(paths, key, artifactJson);

    expect(isArtifactFresh(paths, key)).toBe(true);
    expect(readFileSync(paths.json, "utf8")).toBe(artifactJson);

    const gunzipped = Bun.gunzipSync(readFileSync(paths.gz));
    expect(Buffer.from(gunzipped).toString("utf8")).toBe(artifactJson);
  });

  test("stale on vtt/epub mtime drift and schema bump", () => {
    const { config } = fakeBook();
    const paths = artifactPaths(config, "abc123def456");
    const key: ArtifactCacheKey = {
      schemaVersion: 2,
      vttMtimeMs: 1000,
      epubMtimeMs: 2000,
    };
    writeArtifactCache(paths, key, JSON.stringify({ ok: true }));

    expect(isArtifactFresh(paths, { ...key, vttMtimeMs: 1001 })).toBe(false);
    expect(isArtifactFresh(paths, { ...key, epubMtimeMs: 2001 })).toBe(false);
    expect(isArtifactFresh(paths, { ...key, schemaVersion: 3 })).toBe(false);
  });

  test("artifactKey + bumped file mtime (utimesSync) reads as stale", () => {
    const { config } = fakeBook();
    const paths = artifactPaths(config, "abc123def456");
    const vttPath = vttPathOf(config);
    const epubPath = epubPathOf(config);

    const key = artifactKey(vttPath, epubPath, 2);
    writeArtifactCache(paths, key, JSON.stringify({ ok: true }));
    expect(isArtifactFresh(paths, key)).toBe(true);

    const bumped = new Date(Date.now() + 60_000);
    utimesSync(vttPath, bumped, bumped);
    const afterVttBump = artifactKey(vttPath, epubPath, 2);
    expect(isArtifactFresh(paths, afterVttBump)).toBe(false);

    // Re-freshen, then bump the epub file instead.
    writeArtifactCache(paths, afterVttBump, JSON.stringify({ ok: true }));
    utimesSync(epubPath, bumped, bumped);
    const afterEpubBump = artifactKey(vttPath, epubPath, 2);
    expect(isArtifactFresh(paths, afterEpubBump)).toBe(false);
  });

  test("corrupt sidecar reads as stale, not an error", () => {
    const { config } = fakeBook();
    const paths = artifactPaths(config, "abc123def456");
    const key: ArtifactCacheKey = {
      schemaVersion: 2,
      vttMtimeMs: 1000,
      epubMtimeMs: 2000,
    };
    writeArtifactCache(paths, key, JSON.stringify({ ok: true }));
    writeFileSync(paths.key, "{not json");

    expect(isArtifactFresh(paths, key)).toBe(false);
  });

  test("missing sidecar or missing json file reads as stale", () => {
    const { config } = fakeBook();
    const paths = artifactPaths(config, "abc123def456");
    const key: ArtifactCacheKey = {
      schemaVersion: 2,
      vttMtimeMs: 1000,
      epubMtimeMs: 2000,
    };

    // Sidecar absent entirely.
    expect(isArtifactFresh(paths, key)).toBe(false);

    // Valid sidecar, json file removed.
    writeArtifactCache(paths, key, JSON.stringify({ ok: true }));
    unlinkSync(paths.json);
    expect(isArtifactFresh(paths, key)).toBe(false);
  });
});

describe("loadOrComputeArtifact", () => {
  test("null when vtt or epub is missing", async () => {
    const noVtt = fakeBook({ hasVtt: false });
    const noEpub = fakeBook({ epubRelPath: null });
    const compute: ComputeArtifact = async () => JSON.stringify({ v: 1 });

    expect(
      await loadOrComputeArtifact(noVtt.config, noVtt.book, compute),
    ).toBeNull();
    expect(
      await loadOrComputeArtifact(noEpub.config, noEpub.book, compute),
    ).toBeNull();
  });

  test("cache miss computes once and writes through; second call is fresh and skips compute", async () => {
    const { config, book } = fakeBook();
    let calls = 0;
    const compute: ComputeArtifact = async (vttPath, epubPath, source) => {
      calls++;
      expect(vttPath).toBe(vttPathOf(config));
      expect(epubPath).toBe(epubPathOf(config));
      expect(source).toEqual({ root: "fixtures", base: "test-book" });
      return JSON.stringify({ computed: true });
    };

    const first = await loadOrComputeArtifact(config, book, compute);
    expect(calls).toBe(1);
    expect(first).not.toBeNull();
    expect(readFileSync(first!.paths.json, "utf8")).toBe(
      JSON.stringify({ computed: true }),
    );

    const second = await loadOrComputeArtifact(config, book, compute);
    expect(calls).toBe(1);
    expect(second).toEqual(first);
  });

  test("single-flight: concurrent calls share one in-flight compute", async () => {
    const { config, book } = fakeBook();
    let calls = 0;
    let resolveDeferred!: (value: string) => void;
    const deferred = new Promise<string>((resolve) => {
      resolveDeferred = resolve;
    });
    const compute: ComputeArtifact = async () => {
      calls++;
      return deferred;
    };

    const p1 = loadOrComputeArtifact(config, book, compute);
    const p2 = loadOrComputeArtifact(config, book, compute);

    // Give both calls a chance to reach the in-flight map before resolving
    // (they each await a dynamic import first).
    await Promise.resolve();
    await Promise.resolve();
    resolveDeferred(JSON.stringify({ single: "flight" }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    expect(r1).not.toBeNull();
    expect(r1).toEqual(r2);
  });
});
