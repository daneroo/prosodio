import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  readSweep,
  readSweepFile,
  sweepIndex,
  sweepPath,
  validateSweepBody,
  writeSweep,
} from "./locate-sweep-store.ts";
import type { BookplayerConfig } from "./config.ts";
import type { SweepReport, SweepSource } from "./locate-sweep.ts";

const tempDirs: Array<string> = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Minimal fake config: only dataDir matters to this module. */
function fakeConfig(): BookplayerConfig {
  const repoRoot = tempDir("bookplayer-sweep-root-");
  const dataDir = tempDir("bookplayer-sweep-data-");
  return {
    repoRoot,
    activeRoot: {
      name: "fixtures",
      corporaDir: join(repoRoot, "corpora"),
      transcriptionsDir: join(repoRoot, "transcriptions"),
    },
    dataDir,
    cacheFile: join(dataDir, "cache", "index.json"),
    evidenceDir: join(dataDir, "evidence"),
    ffprobeConcurrency: 4,
  };
}

function fakeReport(
  bookId: string,
  source: SweepSource = "matched",
  overrides: Partial<SweepReport> = {},
): SweepReport {
  const sections: SweepReport["sections"] = [
    {
      href: "text/ch1.xhtml",
      parseMode: "xhtml",
      extensionPredictedMode: "xhtml",
      parity: { ok: true, segCount: 3 },
      tokens: 10,
      ok: 10,
      failures: [],
    },
  ];
  return {
    bookId,
    source,
    totals: { sections: 1, tokens: 10, ok: 10, failed: 0 },
    sections,
    ...overrides,
  };
}

describe("sweepPath", () => {
  test("joins dataDir/cache/<bookId>.locate-sweep.json", () => {
    const config = fakeConfig();
    expect(sweepPath(config, "abc123def456")).toBe(
      join(config.dataDir, "cache", "abc123def456.locate-sweep.json"),
    );
  });
});

describe("writeSweep / readSweep", () => {
  test("write-then-read round-trips with an ISO generatedAt and the report intact", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    const report = fakeReport("abc123def456");

    const stored = writeSweep(path, "abc123def456", report);
    expect(stored.report).toEqual(report);
    expect(new Date(stored.generatedAt).toISOString()).toBe(stored.generatedAt);

    const read = readSweep(path, "matched");
    expect(read).toEqual(stored);
  });

  test("mkdir -p's the cache dir when it does not exist yet", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    writeSweep(path, "abc123def456", fakeReport("abc123def456"));
    expect(readSweep(path, "matched")).not.toBeNull();
  });

  test("missing file reads as null", () => {
    const config = fakeConfig();
    expect(readSweep(sweepPath(config, "000000000000"), "matched")).toBeNull();
  });

  test("corrupt JSON reads as null", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    writeSweep(path, "abc123def456", fakeReport("abc123def456"));
    writeFileSync(path, "{not json");
    expect(readSweep(path, "matched")).toBeNull();
  });

  test("valid JSON but wrong shape reads as null", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ hello: "world" }));
    expect(readSweepFile(path)).toBeNull();

    // Structurally close but sections length disagrees with totals.
    writeFileSync(
      path,
      JSON.stringify({
        version: 2,
        bookId: "abc123def456",
        runs: {
          matched: {
            generatedAt: new Date().toISOString(),
            report: {
              bookId: "abc123def456",
              source: "matched",
              totals: { sections: 2, tokens: 10, ok: 10, failed: 0 },
              sections: [],
            },
          },
        },
      }),
    );
    expect(readSweepFile(path)).toBeNull();
  });

  test("a v1 file on disk (no version: 2) reads as absent — no migration, no error", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    mkdirSync(dirname(path), { recursive: true });
    // Pre-S5 v1 shape: { generatedAt, report } with no `version` field and no
    // `source` on the report.
    writeFileSync(
      path,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        report: {
          bookId: "abc123def456",
          totals: { sections: 1, tokens: 10, ok: 10, failed: 0 },
          sections: [
            {
              href: "text/ch1.xhtml",
              parseMode: "xhtml",
              extensionPredictedMode: "xhtml",
              parity: { ok: true, segCount: 3 },
              tokens: 10,
              ok: 10,
              failures: [],
            },
          ],
        },
      }),
    );
    expect(readSweepFile(path)).toBeNull();
    expect(readSweep(path, "matched")).toBeNull();
    expect(readSweep(path, "all")).toBeNull();
  });

  test("writing 'all' preserves an existing 'matched' run in the same file", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    const matchedReport = fakeReport("abc123def456", "matched");
    const allReport = fakeReport("abc123def456", "all", {
      totals: { sections: 1, tokens: 20, ok: 20, failed: 0 },
    });

    writeSweep(path, "abc123def456", matchedReport);
    writeSweep(path, "abc123def456", allReport);

    const file = readSweepFile(path);
    expect(file?.version).toBe(2);
    expect(file?.bookId).toBe("abc123def456");
    expect(file?.runs.matched?.report).toEqual(matchedReport);
    expect(file?.runs.all?.report).toEqual(allReport);
  });
});

describe("validateSweepBody", () => {
  test("ok case", () => {
    const report = fakeReport("abc123def456");
    const result = validateSweepBody("abc123def456", report);
    expect(result).toEqual({ ok: true, report });
  });

  test("rejects a non-object body", () => {
    const result = validateSweepBody("abc123def456", "nope");
    expect(result.ok).toBe(false);
  });

  test("rejects bookId mismatch with a specific reason", () => {
    const report = fakeReport("other0000000");
    const result = validateSweepBody("abc123def456", report);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("bookId mismatch"),
    });
  });

  test("rejects an invalid source with a specific reason", () => {
    const report = { ...fakeReport("abc123def456"), source: "bogus" };
    const result = validateSweepBody("abc123def456", report);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("source"),
    });
  });

  test("rejects missing/malformed totals with a specific reason", () => {
    const report = fakeReport("abc123def456");
    const bad = { ...report, totals: { sections: "1" } };
    const result = validateSweepBody("abc123def456", bad);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("totals"),
    });
  });

  test("rejects sections length mismatch with a specific reason", () => {
    const report = fakeReport("abc123def456");
    const bad = { ...report, sections: [] };
    const result = validateSweepBody("abc123def456", bad);
    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining("sections length"),
    });
  });
});

describe("sweepIndex", () => {
  test("empty dir (nothing swept yet) reads as []", () => {
    const config = fakeConfig();
    writeSweep(
      sweepPath(config, "abc123def456"),
      "abc123def456",
      fakeReport("abc123def456"),
    );
    // Remove the just-created cache dir's file, leaving the dir but no
    // sweeps, to isolate the "empty" case from the "missing dir" case below.
    rmSync(join(config.dataDir, "cache", "abc123def456.locate-sweep.json"));
    expect(sweepIndex(config)).toEqual([]);
  });

  test("missing cache dir reads as []", () => {
    const config = fakeConfig();
    expect(sweepIndex(config)).toEqual([]);
  });

  test("two stored + one corrupt: corrupt is skipped, result sorted by bookId", () => {
    const config = fakeConfig();
    const cacheDir = join(config.dataDir, "cache");

    writeSweep(
      sweepPath(config, "b00000000000"),
      "b00000000000",
      fakeReport("b00000000000"),
    );
    writeSweep(
      sweepPath(config, "a00000000000"),
      "a00000000000",
      fakeReport("a00000000000"),
    );
    writeSweep(
      sweepPath(config, "c00000000000"),
      "c00000000000",
      fakeReport("c00000000000"),
    );
    writeFileSync(
      join(cacheDir, "corrupt00000.locate-sweep.json"),
      "{not json",
    );
    // A non-sweep file in the same dir must be ignored, not just corrupt ones.
    writeFileSync(join(cacheDir, "index.json"), "{}");

    const index = sweepIndex(config);
    expect(index.map((entry) => entry.bookId)).toEqual([
      "a00000000000",
      "b00000000000",
      "c00000000000",
    ]);
    for (const entry of index) {
      expect(entry.runs.matched?.totals).toEqual({
        sections: 1,
        tokens: 10,
        ok: 10,
        failed: 0,
      });
      expect(typeof entry.runs.matched?.generatedAt).toBe("string");
      expect(entry.runs.all).toBeUndefined();
    }
  });

  test("a book with both matched and all runs reports both in the index", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    writeSweep(path, "abc123def456", fakeReport("abc123def456", "matched"));
    writeSweep(
      path,
      "abc123def456",
      fakeReport("abc123def456", "all", {
        totals: { sections: 1, tokens: 20, ok: 20, failed: 0 },
      }),
    );

    const index = sweepIndex(config);
    expect(index).toHaveLength(1);
    expect(index[0]?.runs.matched?.totals.tokens).toBe(10);
    expect(index[0]?.runs.all?.totals.tokens).toBe(20);
  });
});
