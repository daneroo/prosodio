import { describe, expect, test } from "bun:test";
import { alignBook, alignConfig, computeGaps } from "@prosodio/align";
import { config } from "../lib/config.ts";

// The multipass safety proof (design): a weaker pass — exact k=4 n-grams with
// uniqueness and LIS scoped per residual gap — adds correct spans inside real
// gaps while every Pass 1 span survives byte-for-byte. Alice is the
// evaluation book.
const vttText = await Bun.file(config.aliceVtt).text();
const epubBytes = await Bun.file(config.aliceEpub).arrayBuffer();

describe("multipass proof on Alice", async () => {
  const pass1Only = await alignBook(vttText, epubBytes, {
    proofPass: false,
  });
  const full = await alignBook(vttText, epubBytes);

  const pass1Id = `pass1-exact-k${alignConfig.passes.pass1NgramSize}`;
  const proofId = `proof-exact-k${alignConfig.passes.proofNgramSize}`;

  test("every Pass 1 span survives the proof pass unchanged", () => {
    const pass1SpansInFull = full.spans.filter((s) => s.passId === pass1Id);
    expect(pass1SpansInFull).toEqual(pass1Only.spans);
  });

  test("the proof pass adds spans in real residual gaps", () => {
    const added = full.spans.filter((s) => s.passId === proofId);
    expect(added.length).toBeGreaterThan(0);
    const gaps = computeGaps(pass1Only.spans, {
      vttLength: full.vtt.words.length,
      epubLength: full.epub.tokens.length,
    });
    for (const span of added) {
      const containingGap = gaps.find(
        (g) =>
          span.vttStart >= g.vttStart &&
          span.vttEnd <= g.vttEnd &&
          span.epubStart >= g.epubStart &&
          span.epubEnd <= g.epubEnd,
      );
      expect(containingGap).toBeDefined();
      expect(span.evidence.uniquenessScope).toBe("gap");
      expect(span.evidence.ngramSize).toBe(alignConfig.passes.proofNgramSize);
    }
  });

  test("added spans are exact normalized-token matches too", () => {
    for (const span of full.spans.filter((s) => s.passId === proofId)) {
      const vttSlice = full.vtt.words
        .slice(span.vttStart, span.vttEnd)
        .map((w) => w.norm);
      const epubSlice = full.epub.tokens
        .slice(span.epubStart, span.epubEnd)
        .map((t) => t.norm);
      expect(vttSlice).toEqual(epubSlice);
    }
  });

  test("the combined set stays monotonic and non-overlapping", () => {
    let vttAt = 0;
    let epubAt = 0;
    for (const span of full.spans) {
      expect(span.vttStart).toBeGreaterThanOrEqual(vttAt);
      expect(span.epubStart).toBeGreaterThanOrEqual(epubAt);
      vttAt = span.vttEnd;
      epubAt = span.epubEnd;
    }
  });

  test("pass stats report both passes with no rejections", () => {
    expect(full.passes.map((p) => p.passId)).toEqual([pass1Id, proofId]);
    expect(full.warnings.filter((w) => w.includes("rejected"))).toEqual([]);
    const proofStats = full.passes[1]!;
    expect(proofStats.acceptedSpans).toBe(
      full.spans.filter((s) => s.passId === proofId).length,
    );
  });
});
