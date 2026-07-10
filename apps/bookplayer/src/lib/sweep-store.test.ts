import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  readSweep,
  sweepIndex,
  sweepPath,
  validateSweepBody,
  writeSweep,
} from "./sweep-store.ts";
import type { BookplayerConfig } from "./config.ts";
import type { SweepReport } from "./locate-sweep.ts";

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
    totals: { sections: 1, tokens: 10, ok: 10, failed: 0 },
    sections,
    ...overrides,
  };
}

describe("sweepPath", () => {
  test("joins dataDir/cache/<bookId>.sweep.json", () => {
    const config = fakeConfig();
    expect(sweepPath(config, "abc123def456")).toBe(
      join(config.dataDir, "cache", "abc123def456.sweep.json"),
    );
  });
});

describe("writeSweep / readSweep", () => {
  test("write-then-read round-trips with an ISO generatedAt and the report intact", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    const report = fakeReport("abc123def456");

    const stored = writeSweep(path, report);
    expect(stored.report).toEqual(report);
    expect(new Date(stored.generatedAt).toISOString()).toBe(stored.generatedAt);

    const read = readSweep(path);
    expect(read).toEqual(stored);
  });

  test("mkdir -p's the cache dir when it does not exist yet", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    writeSweep(path, fakeReport("abc123def456"));
    expect(readSweep(path)).not.toBeNull();
  });

  test("missing file reads as null", () => {
    const config = fakeConfig();
    expect(readSweep(sweepPath(config, "000000000000"))).toBeNull();
  });

  test("corrupt JSON reads as null", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    writeSweep(path, fakeReport("abc123def456"));
    writeFileSync(path, "{not json");
    expect(readSweep(path)).toBeNull();
  });

  test("valid JSON but wrong shape reads as null", () => {
    const config = fakeConfig();
    const path = sweepPath(config, "abc123def456");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ hello: "world" }));
    expect(readSweep(path)).toBeNull();

    // Structurally close but sections length disagrees with totals.
    writeFileSync(
      path,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        report: {
          bookId: "abc123def456",
          totals: { sections: 2, tokens: 10, ok: 10, failed: 0 },
          sections: [],
        },
      }),
    );
    expect(readSweep(path)).toBeNull();
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
    writeSweep(sweepPath(config, "abc123def456"), fakeReport("abc123def456"));
    // Remove the just-created cache dir's file, leaving the dir but no
    // sweeps, to isolate the "empty" case from the "missing dir" case below.
    rmSync(join(config.dataDir, "cache", "abc123def456.sweep.json"));
    expect(sweepIndex(config)).toEqual([]);
  });

  test("missing cache dir reads as []", () => {
    const config = fakeConfig();
    expect(sweepIndex(config)).toEqual([]);
  });

  test("two stored + one corrupt: corrupt is skipped, result sorted by bookId", () => {
    const config = fakeConfig();
    const cacheDir = join(config.dataDir, "cache");

    writeSweep(sweepPath(config, "b00000000000"), fakeReport("b00000000000"));
    writeSweep(sweepPath(config, "a00000000000"), fakeReport("a00000000000"));
    writeSweep(sweepPath(config, "c00000000000"), fakeReport("c00000000000"));
    writeFileSync(join(cacheDir, "corrupt00000.sweep.json"), "{not json");
    // A non-sweep file in the same dir must be ignored, not just corrupt ones.
    writeFileSync(join(cacheDir, "index.json"), "{}");

    const index = sweepIndex(config);
    expect(index.map((entry) => entry.bookId)).toEqual([
      "a00000000000",
      "b00000000000",
      "c00000000000",
    ]);
    for (const entry of index) {
      expect(entry.totals).toEqual({
        sections: 1,
        tokens: 10,
        ok: 10,
        failed: 0,
      });
      expect(typeof entry.generatedAt).toBe("string");
    }
  });
});
