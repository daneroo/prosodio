import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  joinAlignedCues,
  readAlignmentCache,
  writeAlignmentCache,
} from "./alignment.ts";
import type { AlignmentCacheKey, JoinWord } from "./alignment.ts";
import type { TranscriptCue } from "./transcript.ts";
import type { AlignmentResult } from "@prosodio/align";

function cue(startSec: number, text: string): TranscriptCue {
  return { startSec, endSec: startSec + 5, text };
}

/** Words laid out per cue: wordsFor(["a b", "c d e"]) -> 5 flat words. */
function wordsFor(cueTexts: Array<string>): Array<JoinWord> {
  return cueTexts.flatMap((text, cueIndex) =>
    text
      .split(" ")
      .filter((raw) => raw.length > 0)
      .map((raw) => ({ cueIndex, raw })),
  );
}

describe("joinAlignedCues", () => {
  const cues = [cue(0, "down the rabbit hole"), cue(5, "curiouser and")];
  const words = wordsFor(["down the rabbit hole", "curiouser and"]);

  test("fully matched cue is a single matched run", () => {
    const { cues: aligned } = joinAlignedCues(
      cues,
      words,
      [{ vttStart: 0, vttEnd: 6 }],
      [],
    );
    expect(aligned[0]).toEqual({
      startSec: 0,
      endSec: 5,
      runs: [{ text: "down the rabbit hole", matched: true }],
      matchedRatio: 1,
      gapEpubTokens: 0,
    });
    expect(aligned[1]?.matchedRatio).toBe(1);
  });

  test("word-level: a span boundary inside a cue splits it into runs", () => {
    // Matches "down the" and "hole" but not "rabbit": three runs.
    const { cues: aligned } = joinAlignedCues(
      cues,
      words,
      [
        { vttStart: 0, vttEnd: 2 },
        { vttStart: 3, vttEnd: 4 },
      ],
      [],
    );
    expect(aligned[0]?.runs).toEqual([
      { text: "down the", matched: true },
      { text: "rabbit", matched: false },
      { text: "hole", matched: true },
    ]);
    expect(aligned[0]?.matchedRatio).toBe(3 / 4);
    expect(aligned[1]?.runs).toEqual([
      { text: "curiouser and", matched: false },
    ]);
  });

  test("gap epub tokens attach to the cue before the gap", () => {
    // Gap over vtt tokens [4,6) (the whole second cue) skipping 120 epub
    // tokens: attributed to cue 0, which holds word seq 3.
    const { cues: aligned, leadingGapEpubTokens } = joinAlignedCues(
      cues,
      words,
      [{ vttStart: 0, vttEnd: 4 }],
      [{ vttStart: 4, vttEnd: 6, epubStart: 500, epubEnd: 620 }],
    );
    expect(aligned[0]?.gapEpubTokens).toBe(120);
    expect(aligned[1]?.gapEpubTokens).toBe(0);
    expect(leadingGapEpubTokens).toBe(0);
  });

  test("a gap at the stream start becomes the leading marker", () => {
    const { cues: aligned, leadingGapEpubTokens } = joinAlignedCues(
      cues,
      words,
      [{ vttStart: 0, vttEnd: 6 }],
      [{ vttStart: 0, vttEnd: 0, epubStart: 0, epubEnd: 300 }],
    );
    expect(leadingGapEpubTokens).toBe(300);
    expect(aligned.every((c) => c.gapEpubTokens === 0)).toBe(true);
  });

  test("degenerate cue (no surviving words) renders raw text unmatched", () => {
    const sparse = [cue(0, "one two"), cue(5, "♪ ♪"), cue(10, "three")];
    const sparseWords: Array<JoinWord> = [
      { cueIndex: 0, raw: "one" },
      { cueIndex: 0, raw: "two" },
      { cueIndex: 2, raw: "three" },
    ];
    const { cues: aligned } = joinAlignedCues(
      sparse,
      sparseWords,
      [{ vttStart: 0, vttEnd: 3 }],
      [],
    );
    expect(aligned[1]).toEqual({
      startSec: 5,
      endSec: 10,
      runs: [{ text: "♪ ♪", matched: false }],
      matchedRatio: 0,
      gapEpubTokens: 0,
    });
  });
});

describe("alignment cache", () => {
  const tempDirs: Array<string> = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true });
  });

  const key: AlignmentCacheKey = {
    schemaVersion: 1,
    vttMtimeMs: 1000,
    epubMtimeMs: 2000,
  };
  // Key checking never inspects the result, so a stub cast is sufficient.
  const result = { schemaVersion: 1, spans: [] } as unknown as AlignmentResult;

  function tempCachePath(): string {
    const dir = mkdtempSync(join(tmpdir(), "bookplayer-align-"));
    tempDirs.push(dir);
    return join(dir, "align", "abc123def456.json");
  }

  test("write-through then fresh read round-trips", () => {
    const path = tempCachePath();
    writeAlignmentCache(path, key, result);
    expect(readAlignmentCache(path, key)).toEqual(result);
  });

  test("misses on absent file, source mtime drift, and schema bump", () => {
    const path = tempCachePath();
    expect(readAlignmentCache(path, key)).toBeNull();
    writeAlignmentCache(path, key, result);
    expect(readAlignmentCache(path, { ...key, vttMtimeMs: 1001 })).toBeNull();
    expect(readAlignmentCache(path, { ...key, epubMtimeMs: 2001 })).toBeNull();
    expect(readAlignmentCache(path, { ...key, schemaVersion: 2 })).toBeNull();
  });

  test("corrupt cache file reads as a miss, not an error", async () => {
    const path = tempCachePath();
    writeAlignmentCache(path, key, result);
    await Bun.write(path, "{not json");
    expect(readAlignmentCache(path, key)).toBeNull();
  });
});
