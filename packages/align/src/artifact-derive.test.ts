import { describe, expect, test } from "bun:test";
import {
  activeTokenAt,
  deriveCueAggregates,
  deriveEpubSeq,
  deriveTokenEndTimes,
  deriveTokenTimes,
  epubLocatorAt,
  tokenRaw,
} from "./artifact-derive.ts";
import { interpolateWordTimes } from "./cue-times.ts";
import type { AlignmentArtifact } from "./artifact.ts";

type Vtt = AlignmentArtifact["vtt"];
type Epub = AlignmentArtifact["epub"];
type Span = AlignmentArtifact["match"]["spans"][number];
type Gap = AlignmentArtifact["match"]["gaps"][number];

/**
 * Two cues, "down the rabbit hole" (4 words) and "curiouser and" (2 words) —
 * the same fixture apps/bookplayer/src/lib/alignment.test.ts uses for
 * joinAlignedCues, ported to columns so the ported cases stay recognizable.
 */
function vttFixture(): Vtt {
  return {
    cues: {
      startSec: [0, 5],
      endSec: [5, 10],
      text: ["down the rabbit hole", "curiouser and"],
    },
    tokens: {
      cueIndex: [0, 0, 0, 0, 1, 1],
      charStart: [0, 5, 9, 16, 0, 10],
      charEnd: [4, 8, 15, 20, 9, 13],
    },
  };
}

function span(overrides: Partial<Span>): Span {
  return {
    passId: "p1",
    vttStart: 0,
    vttEnd: 1,
    epubStart: 0,
    epubEnd: 1,
    evidence: {
      kind: "exact-unique-ngram",
      ngramSize: 3,
      uniquenessScope: "global",
      anchors: 1,
      extendedLeft: 0,
      extendedRight: 0,
    },
    ...overrides,
  };
}

function gap(overrides: Partial<Gap>): Gap {
  return { vttStart: 0, vttEnd: 0, epubStart: 0, epubEnd: 0, ...overrides };
}

describe("deriveTokenTimes", () => {
  test("word timing: every token in a cue starts at the cue's startSec", () => {
    const vtt = vttFixture();
    const times = deriveTokenTimes(vtt, "word");
    expect(times).toEqual([0, 0, 0, 0, 5, 5]);
  });

  test("interpolated timing matches interpolateWordTimes per cue", () => {
    const vtt = vttFixture();
    const times = deriveTokenTimes(vtt, "interpolated");
    const cue0 = interpolateWordTimes(0, 5, 4);
    const cue1 = interpolateWordTimes(5, 10, 2);
    expect(times).toEqual([...cue0, ...cue1]);
  });

  // Codex #6: word timing has no sub-cue timestamps, so a cue with multiple
  // normalized tokens collapses every token to the same start. This is
  // existing engine policy (joinAlignedCues had the same behavior via
  // JoinWord.timeSec) — pinned here rather than left as an assumption.
  test("Codex #6 pin: word timing collapses a multi-token cue's starts to one value", () => {
    const vtt = vttFixture();
    const times = deriveTokenTimes(vtt, "word");
    // cue 0 has 4 tokens; all four share startSec 0.
    expect(times.slice(0, 4)).toEqual([0, 0, 0, 0]);
    const endTimes = deriveTokenEndTimes(times, vtt);
    // Zero-width for every token but the last, which runs to the cue end.
    expect(endTimes.slice(0, 4)).toEqual([0, 0, 0, 5]);
  });
});

describe("deriveTokenEndTimes", () => {
  test("chains to the next token's start within a cue; last token runs to the cue end", () => {
    const vtt = vttFixture();
    const times = [0, 1, 2, 3, 5, 6]; // interpolated-style, one second apart
    const endTimes = deriveTokenEndTimes(times, vtt);
    expect(endTimes).toEqual([1, 2, 3, 5, 6, 10]);
  });

  test("non-monotonic guard: Math.max keeps every interval non-empty", () => {
    const vtt = vttFixture();
    // A pathological times column where token 1 starts before token 0.
    const times = [2, 0, 3, 4, 5, 6];
    const endTimes = deriveTokenEndTimes(times, vtt);
    // token 0 -> next start 0, but clamped to its own start 2.
    expect(endTimes[0]).toBe(2);
  });
});

describe("deriveEpubSeq", () => {
  test("spans map to epubStart + (seq - vttStart); everything else is -1", () => {
    const spans: Span[] = [
      span({ vttStart: 0, vttEnd: 2, epubStart: 100, epubEnd: 102 }),
      span({ vttStart: 3, vttEnd: 4, epubStart: 300, epubEnd: 301 }),
    ];
    const epubSeq = deriveEpubSeq(spans, 6);
    expect(epubSeq).toEqual([100, 101, -1, 300, -1, -1]);
  });

  test("no spans: every token unmatched", () => {
    expect(deriveEpubSeq([], 3)).toEqual([-1, -1, -1]);
  });
});

describe("deriveCueAggregates", () => {
  test("every token matched: ratio 1 per cue, no gap tokens", () => {
    const vtt = vttFixture();
    const spans: Span[] = [
      span({ vttStart: 0, vttEnd: 6, epubStart: 100, epubEnd: 106 }),
    ];
    const epubSeq = deriveEpubSeq(spans, 6);
    const { matchedRatio, gapEpubTokens, leadingGapEpubTokens } =
      deriveCueAggregates(vtt, epubSeq, []);
    expect(matchedRatio).toEqual([1, 1]);
    expect(gapEpubTokens).toEqual([0, 0]);
    expect(leadingGapEpubTokens).toBe(0);
  });

  test("word-level: partial match within a cue gives a fractional ratio", () => {
    // Matches "down the" (seq 0,1) and "hole" (seq 3) but not "rabbit" (seq 2).
    const vtt = vttFixture();
    const spans: Span[] = [
      span({ vttStart: 0, vttEnd: 2, epubStart: 100, epubEnd: 102 }),
      span({ vttStart: 3, vttEnd: 4, epubStart: 300, epubEnd: 301 }),
    ];
    const epubSeq = deriveEpubSeq(spans, 6);
    const { matchedRatio } = deriveCueAggregates(vtt, epubSeq, []);
    expect(matchedRatio[0]).toBe(3 / 4);
    expect(matchedRatio[1]).toBe(0);
  });

  test("gap epub tokens attach to the cue before the gap", () => {
    // Gap over vtt [4,6) (the whole second cue) skipping 120 epub tokens:
    // attributed to cue 0, which holds word seq 3 (cueIndex[3] === 0).
    const vtt = vttFixture();
    const spans: Span[] = [
      span({ vttStart: 0, vttEnd: 4, epubStart: 0, epubEnd: 4 }),
    ];
    const epubSeq = deriveEpubSeq(spans, 6);
    const gaps: Gap[] = [
      gap({ vttStart: 4, vttEnd: 6, epubStart: 500, epubEnd: 620 }),
    ];
    const { gapEpubTokens, leadingGapEpubTokens } = deriveCueAggregates(
      vtt,
      epubSeq,
      gaps,
    );
    expect(gapEpubTokens).toEqual([120, 0]);
    expect(leadingGapEpubTokens).toBe(0);
  });

  test("a gap at the stream start becomes the leading marker", () => {
    const vtt = vttFixture();
    const spans: Span[] = [
      span({ vttStart: 0, vttEnd: 6, epubStart: 0, epubEnd: 6 }),
    ];
    const epubSeq = deriveEpubSeq(spans, 6);
    const gaps: Gap[] = [
      gap({ vttStart: 0, vttEnd: 0, epubStart: 0, epubEnd: 300 }),
    ];
    const { gapEpubTokens, leadingGapEpubTokens } = deriveCueAggregates(
      vtt,
      epubSeq,
      gaps,
    );
    expect(leadingGapEpubTokens).toBe(300);
    expect(gapEpubTokens.every((n) => n === 0)).toBe(true);
  });

  test("zero-token cue gets matchedRatio 0, not NaN", () => {
    const vtt: Vtt = {
      cues: {
        startSec: [0, 5, 10],
        endSec: [5, 10, 12],
        text: ["one two", "♪ ♪", "three"],
      },
      tokens: {
        // cue 1 ("♪ ♪") contributes no tokens at all.
        cueIndex: [0, 0, 2],
        charStart: [0, 4, 0],
        charEnd: [3, 7, 5],
      },
    };
    const spans: Span[] = [
      span({ vttStart: 0, vttEnd: 3, epubStart: 0, epubEnd: 3 }),
    ];
    const epubSeq = deriveEpubSeq(spans, 3);
    const { matchedRatio } = deriveCueAggregates(vtt, epubSeq, []);
    expect(matchedRatio).toEqual([1, 0, 1]);
  });

  test("a skipped (epubTokens <= 0) gap contributes nothing", () => {
    const vtt = vttFixture();
    const epubSeq = deriveEpubSeq([], 6);
    const gaps: Gap[] = [
      gap({ vttStart: 4, vttEnd: 6, epubStart: 5, epubEnd: 5 }),
    ];
    const { gapEpubTokens, leadingGapEpubTokens } = deriveCueAggregates(
      vtt,
      epubSeq,
      gaps,
    );
    expect(gapEpubTokens).toEqual([0, 0]);
    expect(leadingGapEpubTokens).toBe(0);
  });
});

describe("activeTokenAt", () => {
  const starts = [0, 1, 3, 5];
  const ends = [1, 3, 3, 8]; // interval 2 (index 2) is a zero-width hole [3,3)

  test("hit: t lands inside an interval", () => {
    expect(activeTokenAt(starts, ends, 2)).toBe(1);
  });

  test("miss in a hole: zero-width interval never contains its own start", () => {
    // t=3 lands exactly on interval 2's start, but [3,3) is zero-width and
    // interval 3 hasn't started yet (start 5 > 3) — no interval contains it.
    expect(activeTokenAt(starts, ends, 3)).toBe(-1);
  });

  test("before the first interval", () => {
    expect(activeTokenAt(starts, ends, -1)).toBe(-1);
  });

  test("after the last interval", () => {
    expect(activeTokenAt(starts, ends, 8)).toBe(-1);
  });

  test("boundary: start is inclusive, end is exclusive", () => {
    expect(activeTokenAt(starts, ends, 0)).toBe(0);
    expect(activeTokenAt(starts, ends, 1)).toBe(1); // end of interval 0 is exclusive
    expect(activeTokenAt(starts, ends, 5)).toBe(3);
  });

  test("empty columns", () => {
    expect(activeTokenAt([], [], 0)).toBe(-1);
  });
});

describe("epubLocatorAt", () => {
  function epubFixture(): Epub {
    return {
      spines: [
        {
          href: "chapter1.xhtml",
          parseMode: "xhtml",
          segPaths: [[0], [1]],
          segTextLen: [3, 5],
        },
        {
          href: "chapter2.xhtml",
          parseMode: "html-fallback",
          segPaths: [[0, 1]],
          segTextLen: [7],
        },
      ],
      tokens: {
        spineIndex: [0, 0, 1],
        startSeg: [0, 1, 0],
        startOffset: [0, 0, 2],
        endSeg: [0, 1, 0],
        endOffset: [3, 5, 5],
      },
    };
  }

  test("valid read matches the fixture's columns", () => {
    const epub = epubFixture();
    expect(epubLocatorAt(epub, 1)).toEqual({
      spineHref: "chapter1.xhtml",
      parseMode: "xhtml",
      segPaths: [[0], [1]],
      segTextLen: [3, 5],
      loc: { startSeg: 1, startOffset: 0, endSeg: 1, endOffset: 5 },
    });
    expect(epubLocatorAt(epub, 2)).toEqual({
      spineHref: "chapter2.xhtml",
      parseMode: "html-fallback",
      segPaths: [[0, 1]],
      segTextLen: [7],
      loc: { startSeg: 0, startOffset: 2, endSeg: 0, endOffset: 5 },
    });
  });

  test("out-of-range epubSeq returns null", () => {
    const epub = epubFixture();
    expect(epubLocatorAt(epub, -1)).toBeNull();
    expect(epubLocatorAt(epub, 3)).toBeNull();
    expect(epubLocatorAt(epub, 1.5)).toBeNull();
  });

  test("unknown spineIndex returns null", () => {
    const epub = epubFixture();
    epub.tokens.spineIndex = [0, 0, 5];
    expect(epubLocatorAt(epub, 2)).toBeNull();
  });
});

describe("tokenRaw", () => {
  test("slices the cue's text column by the token's char range", () => {
    const vtt = vttFixture();
    expect(tokenRaw(vtt, 0)).toBe("down");
    expect(tokenRaw(vtt, 1)).toBe("the");
    expect(tokenRaw(vtt, 2)).toBe("rabbit");
    expect(tokenRaw(vtt, 3)).toBe("hole");
    expect(tokenRaw(vtt, 4)).toBe("curiouser");
    expect(tokenRaw(vtt, 5)).toBe("and");
  });

  test("out-of-range seq returns an empty string", () => {
    const vtt = vttFixture();
    expect(tokenRaw(vtt, -1)).toBe("");
    expect(tokenRaw(vtt, 99)).toBe("");
  });
});

// Browser-safety guard (T1.3 done-criteria): the module's own import list is
// the enforcement point, checked by reading the file rather than a runtime
// meta-test — `grep -n "jsdom\|node:" packages/align/src/artifact-derive.ts`
// must return nothing. This module imports only cue-times.ts (value) and
// artifact.ts / epub-dom-path.ts (types), neither of which pulls in zod,
// jsdom, or node builtins.
