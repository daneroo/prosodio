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
import { activeTokenIndex } from "./cues.ts";
import type { TranscriptCue } from "./transcript.ts";
import type { AlignmentResult } from "@prosodio/align";

function cue(startSec: number, text: string): TranscriptCue {
  return { startSec, endSec: startSec + 5, text };
}

/**
 * Words laid out per cue with per-cue interpolated start times: each word
 * starts one second after the previous within its cue (cue N starts at 5N).
 * wordsFor(["a b", "c d e"]) -> 5 flat words.
 */
function wordsFor(cueTexts: Array<string>): Array<JoinWord> {
  return cueTexts.flatMap((text, cueIndex) =>
    text
      .split(" ")
      .filter((raw) => raw.length > 0)
      .map((raw, wordIndex) => ({
        cueIndex,
        raw,
        timeSec: cueIndex * 5 + wordIndex,
      })),
  );
}

describe("joinAlignedCues", () => {
  const cues = [cue(0, "down the rabbit hole"), cue(5, "curiouser and")];
  const words = wordsFor(["down the rabbit hole", "curiouser and"]);

  test("every token matched; ratio 1; intervals chain to the cue end", () => {
    const { cues: aligned } = joinAlignedCues(
      cues,
      words,
      [{ vttStart: 0, vttEnd: 6, epubStart: 100 }],
      [],
    );
    expect(aligned[0]?.tokens).toEqual([
      { raw: "down", startSec: 0, endSec: 1, matched: true, epubSeq: 100 },
      { raw: "the", startSec: 1, endSec: 2, matched: true, epubSeq: 101 },
      { raw: "rabbit", startSec: 2, endSec: 3, matched: true, epubSeq: 102 },
      // last token runs to the cue end (5), not the next cue's first token.
      { raw: "hole", startSec: 3, endSec: 5, matched: true, epubSeq: 103 },
    ]);
    expect(aligned[0]?.matchedRatio).toBe(1);
    expect(aligned[1]?.matchedRatio).toBe(1);
  });

  test("word-level: a span boundary inside a cue flags tokens individually", () => {
    // Matches "down the" and "hole" but not "rabbit".
    const { cues: aligned } = joinAlignedCues(
      cues,
      words,
      [
        { vttStart: 0, vttEnd: 2, epubStart: 100 },
        { vttStart: 3, vttEnd: 4, epubStart: 300 },
      ],
      [],
    );
    expect(aligned[0]?.tokens.map((t) => [t.raw, t.matched])).toEqual([
      ["down", true],
      ["the", true],
      ["rabbit", false],
      ["hole", true],
    ]);
    expect(aligned[0]?.matchedRatio).toBe(3 / 4);
    expect(aligned[1]?.tokens.every((t) => !t.matched)).toBe(true);
  });

  test("gap epub tokens attach to the cue before the gap", () => {
    // Gap over vtt tokens [4,6) (the whole second cue) skipping 120 epub
    // tokens: attributed to cue 0, which holds word seq 3.
    const { cues: aligned, leadingGapEpubTokens } = joinAlignedCues(
      cues,
      words,
      [{ vttStart: 0, vttEnd: 4, epubStart: 0 }],
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
      [{ vttStart: 0, vttEnd: 6, epubStart: 0 }],
      [{ vttStart: 0, vttEnd: 0, epubStart: 0, epubEnd: 300 }],
    );
    expect(leadingGapEpubTokens).toBe(300);
    expect(aligned.every((c) => c.gapEpubTokens === 0)).toBe(true);
  });

  test("active-token lookup within a cue keys on token intervals", () => {
    const { cues: aligned } = joinAlignedCues(cues, words, [], []);
    const tokens = aligned[0]!.tokens;
    // "the" occupies [1,2): t=1 is inside it, t=2 has moved on to "rabbit".
    expect(activeTokenIndex(tokens, 1)).toBe(1);
    expect(activeTokenIndex(tokens, 2)).toBe(2);
    // The last token "hole" spans [3,5) up to the cue end.
    expect(activeTokenIndex(tokens, 4.9)).toBe(3);
  });

  test("degenerate cue (no surviving words) renders raw text unmatched", () => {
    const sparse = [cue(0, "one two"), cue(5, "♪ ♪"), cue(10, "three")];
    const sparseWords: Array<JoinWord> = [
      { cueIndex: 0, raw: "one", timeSec: 0 },
      { cueIndex: 0, raw: "two", timeSec: 1 },
      { cueIndex: 2, raw: "three", timeSec: 10 },
    ];
    const { cues: aligned } = joinAlignedCues(
      sparse,
      sparseWords,
      [{ vttStart: 0, vttEnd: 3, epubStart: 0 }],
      [],
    );
    expect(aligned[1]).toEqual({
      startSec: 5,
      endSec: 10,
      tokens: [
        { raw: "♪ ♪", startSec: 5, endSec: 10, matched: false, epubSeq: null },
      ],
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
