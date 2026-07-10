import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fetchArtifact, prepareAlignment } from "./alignment-client.ts";
import type { PreparedAlignment } from "./alignment-client.ts";
import type { AlignmentArtifact } from "@prosodio/align/browser";

/**
 * A small synthetic artifact exercising the same cases as
 * packages/align/src/artifact-derive.test.ts, plus a zero-token cue and a
 * leading gap so prepareAlignment's own bookkeeping (cueTokenStart/
 * cueTokenCount) has something to spot-check:
 *
 *  - cue 0 "down the rabbit hole": 4 tokens, all matched to epub 50..53.
 *  - cue 1 "♪ ♪": 0 tokens (degenerate; music-note-only cue).
 *  - cue 2 "curiouser and": 2 tokens, unmatched.
 *
 * Gaps: a leading gap of 50 epub tokens before token 0, and a 6-token gap
 * attributed to cue 0 (the cue holding the last word before the gap).
 */
function syntheticArtifact(): AlignmentArtifact {
  return {
    schemaVersion: 3,
    features: [],
    source: {
      root: "fixtures",
      base: "synthetic",
      vttTiming: "word",
      vttProvenance: null,
    },
    config: {
      normalizationPolicy: "strict-nfkc-v1",
      pass1NgramSize: 6,
      proofNgramSize: 4,
      extraction: {
        includeNonLinearSpineItems: true,
        excludedElements: ["head", "script", "style"],
        domParser: "jsdom",
        parseMode: "by-extension",
      },
    },
    match: {
      spans: [
        {
          passId: "p1",
          vttStart: 0,
          vttEnd: 4,
          epubStart: 50,
          epubEnd: 54,
          evidence: {
            kind: "exact-unique-ngram",
            ngramSize: 3,
            uniquenessScope: "global",
            anchors: 1,
            extendedLeft: 0,
            extendedRight: 0,
          },
        },
      ],
      gaps: [
        { vttStart: 0, vttEnd: 0, epubStart: 0, epubEnd: 50 },
        { vttStart: 4, vttEnd: 4, epubStart: 54, epubEnd: 60 },
      ],
      metrics: {
        passes: [],
        vttTokens: 6,
        epubTokens: 60,
        vttMatchedTokens: 4,
        epubMatchedTokens: 4,
        vttCoverage: 4 / 6,
        epubCoverage: 4 / 60,
        spanCount: 1,
        gapCount: 2,
        gapVttTokens: { count: 2, min: 0, max: 0, mean: 0, median: 0 },
        gapEpubTokens: { count: 2, min: 6, max: 50, mean: 28, median: 28 },
        gapSeconds: { count: 2, min: 0, max: 0, mean: 0, median: 0 },
        spines: [],
        anchorDensity: [],
        anomalies: [],
        warnings: [],
      },
    },
    vtt: {
      cues: {
        startSec: [0, 5, 10],
        endSec: [5, 6, 13],
        text: ["down the rabbit hole", "♪ ♪", "curiouser and"],
      },
      tokens: {
        cueIndex: [0, 0, 0, 0, 2, 2],
        charStart: [0, 5, 9, 16, 0, 10],
        charEnd: [4, 8, 15, 20, 9, 13],
      },
    },
    epub: {
      spines: [
        {
          href: "chapter1.xhtml",
          parseMode: "xhtml",
          segPaths: [[0]],
          segTextLen: [10],
        },
      ],
      tokens: {
        spineIndex: [0],
        startSeg: [0],
        startOffset: [0],
        endSeg: [0],
        endOffset: [1],
      },
    },
  };
}

describe("prepareAlignment", () => {
  let prepared: PreparedAlignment;

  beforeEach(() => {
    prepared = prepareAlignment(syntheticArtifact());
  });

  test("carries the artifact through unchanged", () => {
    expect(prepared.artifact).toEqual(syntheticArtifact());
  });

  test("tokenStart/tokenEnd: word timing collapses each cue's tokens to the cue start", () => {
    // cue 0's four tokens all start at 0; the last runs to the cue end (5).
    expect(prepared.tokenStart.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(prepared.tokenEnd.slice(0, 4)).toEqual([0, 0, 0, 5]);
    // cue 2's two tokens start at 10; the last runs to the cue end (13).
    expect(prepared.tokenStart.slice(4, 6)).toEqual([10, 10]);
    expect(prepared.tokenEnd.slice(4, 6)).toEqual([10, 13]);
  });

  test("epubSeq: matched span resolves to epubStart + offset, unmatched is -1", () => {
    expect(prepared.epubSeq).toEqual([50, 51, 52, 53, -1, -1]);
  });

  test("matchedRatio: cue 0 fully matched, zero-token cue is 0, unmatched cue is 0", () => {
    expect(prepared.matchedRatio).toEqual([1, 0, 0]);
  });

  test("gapEpubTokens: the post-cue-0 gap attaches to cue 0", () => {
    expect(prepared.gapEpubTokens).toEqual([6, 0, 0]);
  });

  test("leadingGapEpubTokens: the pre-token-0 gap is the leading marker", () => {
    expect(prepared.leadingGapEpubTokens).toBe(50);
  });

  test("cueTokenStart/cueTokenCount: normal cues get their first index and count", () => {
    expect(prepared.cueTokenStart[0]).toBe(0);
    expect(prepared.cueTokenCount[0]).toBe(4);
    expect(prepared.cueTokenStart[2]).toBe(4);
    expect(prepared.cueTokenCount[2]).toBe(2);
  });

  test("cueTokenStart/cueTokenCount: a zero-token cue gets start -1, count 0", () => {
    expect(prepared.cueTokenStart[1]).toBe(-1);
    expect(prepared.cueTokenCount[1]).toBe(0);
  });
});

describe("fetchArtifact", () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  beforeEach(() => {
    capturedUrl = undefined;
    capturedInit = undefined;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(respond: () => Response): void {
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedUrl = String(url);
      capturedInit = init;
      return respond();
    }) as typeof fetch;
  }

  test("200 returns ready with the parsed body", async () => {
    const artifact = syntheticArtifact();
    stubFetch(
      () =>
        new Response(JSON.stringify(artifact), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const result = await fetchArtifact("abc123def456");
    expect(result).toEqual({ status: "ready", artifact });
  });

  test("404 returns unavailable", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    const result = await fetchArtifact("abc123def456");
    expect(result).toEqual({ status: "unavailable" });
  });

  test("500 throws", async () => {
    stubFetch(
      () =>
        new Response(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
    );
    await expect(fetchArtifact("abc123def456")).rejects.toThrow();
  });

  test("the request URL contains the book id", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    await fetchArtifact("abc123def456");
    expect(capturedUrl).toContain("abc123def456");
  });

  test("the abort signal is forwarded to fetch", async () => {
    stubFetch(() => new Response(null, { status: 404 }));
    const controller = new AbortController();
    await fetchArtifact("abc123def456", controller.signal);
    expect(capturedInit?.signal).toBe(controller.signal);
  });
});
