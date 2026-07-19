import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLibrary } from "./library.ts";
import type { BookplayerConfig } from "./config.ts";
import type { ProbeFn, ProbeResult } from "./ffprobe.ts";
import type { BookCache } from "./types.ts";

const tempDirs: Array<string> = [];

function makeConfig(): BookplayerConfig {
  const base = mkdtempSync(join(tmpdir(), "bookplayer-lib-"));
  tempDirs.push(base);
  const corporaDir = join(base, "audiobooks");
  const transcriptionsDir = join(base, "transcriptions");
  const dataDir = join(base, "data");
  mkdirSync(corporaDir, { recursive: true });
  mkdirSync(transcriptionsDir, { recursive: true });
  return {
    repoRoot: base,
    activeRoot: { name: "fixtures", corporaDir, transcriptionsDir },
    dataDir,
    cacheFile: join(dataDir, "cache", "index.json"),
    evidenceDir: join(dataDir, "evidence"),
    ffprobeConcurrency: 2,
  };
}

function addBook(config: BookplayerConfig, dir: string, base: string): void {
  const abs = join(config.activeRoot.corporaDir, dir);
  mkdirSync(abs, { recursive: true });
  writeFileSync(join(abs, `${base}.m4b`), "m4b-bytes");
  writeFileSync(join(abs, "cover.jpg"), "jpg");
}

function stubProbe(
  result: Partial<ProbeResult>,
  calls: Array<string>,
): ProbeFn {
  return (filePath) => {
    calls.push(filePath);
    return Promise.resolve({
      durationSec: 60,
      bitrateKbps: 64,
      codec: "aac",
      titleTag: null,
      artistTag: null,
      ...result,
    });
  };
}

async function settle(): Promise<void> {
  // enrichment runs fire-and-forget; two macrotask turns settle it
  await new Promise((resolve) => setTimeout(resolve, 10));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("library lifecycle", () => {
  test("first access scans, persists the cache, and enriches", async () => {
    const config = makeConfig();
    addBook(config, "one", "Book One");
    const calls: Array<string> = [];
    const library = createLibrary(
      config,
      stubProbe({ durationSec: 123 }, calls),
    );

    const index = library.getIndex();
    expect(index.books).toHaveLength(1);
    expect(existsSync(config.cacheFile)).toBe(true);

    await settle();
    expect(calls).toHaveLength(1);
    expect(library.getIndex().books[0]?.metadata.durationSec).toBe(123);

    const cache = JSON.parse(
      readFileSync(config.cacheFile, "utf8"),
    ) as BookCache;
    expect(cache.books[0]?.metadata.durationSec).toBe(123);
  });

  test("cache restore serves immediately and revalidation reuses fingerprints", async () => {
    const config = makeConfig();
    addBook(config, "one", "Book One");

    const firstCalls: Array<string> = [];
    const first = createLibrary(
      config,
      stubProbe({ durationSec: 99 }, firstCalls),
    );
    first.getIndex();
    await settle();
    expect(firstCalls).toHaveLength(1);

    // Fresh library instance, same cache: restore must not re-probe an
    // unchanged m4b.
    const secondCalls: Array<string> = [];
    const second = createLibrary(
      config,
      stubProbe({ durationSec: 1 }, secondCalls),
    );
    const restored = second.getIndex();
    expect(restored.books[0]?.metadata.durationSec).toBe(99);
    await settle();
    expect(secondCalls).toHaveLength(0);
    expect(second.getIndex().books[0]?.metadata.durationSec).toBe(99);
  });

  test("a changed fingerprint triggers re-probe", async () => {
    const config = makeConfig();
    addBook(config, "one", "Book One");

    const first = createLibrary(config, stubProbe({ durationSec: 99 }, []));
    first.getIndex();
    await settle();

    // Touch the m4b: mtime + size change → fingerprint mismatch.
    const m4b = join(config.activeRoot.corporaDir, "one", "Book One.m4b");
    writeFileSync(m4b, "different-bytes-entirely");
    utimesSync(m4b, new Date(), new Date(Date.now() + 5000));

    const secondCalls: Array<string> = [];
    const second = createLibrary(
      config,
      stubProbe({ durationSec: 42 }, secondCalls),
    );
    second.getIndex();
    await settle();
    expect(secondCalls).toHaveLength(1);
    expect(second.getIndex().books[0]?.metadata.durationSec).toBe(42);
  });

  test("a version or root mismatch discards the cache", () => {
    const config = makeConfig();
    addBook(config, "one", "Book One");
    mkdirSync(join(config.dataDir, "cache"), { recursive: true });
    writeFileSync(
      config.cacheFile,
      JSON.stringify({ version: 99, rootName: "private", books: [] }),
    );

    const library = createLibrary(config, stubProbe({}, []));
    const index = library.getIndex();
    // Discarded cache forces a real scan of the actual corpora dir.
    expect(index.books).toHaveLength(1);
    expect(index.scanDurationMs).toBeGreaterThanOrEqual(0);
  });

  test("a v1 cache on disk is rejected and rescanned", () => {
    const config = makeConfig();
    addBook(config, "one", "Book One");
    mkdirSync(join(config.dataDir, "cache"), { recursive: true });
    // v1 shape: no `findings`, and books lack the v2 match-quality fields.
    writeFileSync(
      config.cacheFile,
      JSON.stringify({
        version: 1,
        rootName: "fixtures",
        scannedAt: "2020-01-01T00:00:00.000Z",
        books: [],
      }),
    );

    const library = createLibrary(config, stubProbe({}, []));
    const index = library.getIndex();
    // The version bump is the intended migration: v1 is invalidated wholesale
    // rather than field-migrated, so a real scan runs and finds the book.
    expect(index.books).toHaveLength(1);
    expect(index.scanDurationMs).toBeGreaterThanOrEqual(0);
  });

  test("cache v2 round-trips findings across a restore", async () => {
    const config = makeConfig();
    addBook(config, "one", "Book One");
    addBook(config, "one", "Book Two"); // second .m4b -> multi-m4b finding

    const first = createLibrary(config, stubProbe({}, []));
    const firstIndex = first.getIndex();
    expect(firstIndex.findings.length).toBeGreaterThan(0);
    await settle();

    const cache = JSON.parse(
      readFileSync(config.cacheFile, "utf8"),
    ) as BookCache;
    expect(cache.version).toBe(3);
    expect(cache.findings.length).toBe(firstIndex.findings.length);
    expect(cache.findings[0]?.code).toBe("multi-m4b");

    // Fresh library instance restoring from the persisted cache must surface
    // the same findings without a rescan.
    const second = createLibrary(config, stubProbe({}, []));
    const restored = second.getIndex();
    expect(restored.findings).toEqual(firstIndex.findings);
  });

  test("refresh rescans and picks up new books; getBook resolves ids", () => {
    const config = makeConfig();
    addBook(config, "one", "Book One");
    const library = createLibrary(config, stubProbe({}, []));
    expect(library.getIndex().books).toHaveLength(1);

    addBook(config, "two", "Book Two");
    expect(library.refresh()).toBe(true);
    const index = library.getIndex();
    expect(index.books).toHaveLength(2);
    const second = index.books[1];
    if (!second) throw new Error("expected two books");
    expect(library.getBook(second.id)?.basename).toBe(second.basename);
    expect(library.getBook("ffffffffffff")).toBeUndefined();
  });

  test("m4b tags are canonical; they override even a structured basename", async () => {
    const config = makeConfig();
    addBook(config, "one", "Author - Book One");
    addBook(config, "two", "unstructured");
    const library = createLibrary(
      config,
      stubProbe({ titleTag: "Tag Title", artistTag: "Tag Author" }, []),
    );
    library.getIndex();
    await settle();
    const structured = library
      .getIndex()
      .books.find((b) => b.basename === "Author - Book One");
    const unstructured = library
      .getIndex()
      .books.find((b) => b.basename === "unstructured");
    // Tags win over the "Author - Book One" basename parse — the curated
    // corpus's tags are the truth (metadata-canonical-from-tags).
    expect(structured?.metadata.title).toBe("Tag Title");
    expect(structured?.metadata.author).toBe("Tag Author");
    expect(unstructured?.metadata.title).toBe("Tag Title");
    expect(unstructured?.metadata.author).toBe("Tag Author");
  });

  test("basename is the fallback when the m4b has no tags", async () => {
    const config = makeConfig();
    addBook(config, "one", "Author - Book One");
    const library = createLibrary(
      config,
      // durationSec present so enrich runs, but no title/artist tags.
      stubProbe({ titleTag: null, artistTag: null }, []),
    );
    library.getIndex();
    await settle();
    const book = library
      .getIndex()
      .books.find((b) => b.basename === "Author - Book One");
    expect(book?.metadata.title).toBe("Book One");
    expect(book?.metadata.author).toBe("Author");
  });
});
