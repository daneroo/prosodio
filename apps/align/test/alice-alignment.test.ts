import { describe, expect, test } from "bun:test";
import { alignBook } from "@prosodio/align";
import { config } from "../lib/config.ts";

// End-to-end Pass 1 on the committed public triplet (VTT + EPUB; no m4b
// needed). Deliberately a hard case: the LibriVox narration reads the full
// Gutenberg #11 text while the committed EPUB is the abridged illustrated
// #19033 retelling — coverage is partial by construction, correctness is not.
const vttText = await Bun.file(config.aliceVtt).text();

describe("Alice end-to-end Pass 1", async () => {
  const result = await alignBook(vttText, config.aliceEpub);

  test("produces sparse anchors", () => {
    expect(result.spans.length).toBeGreaterThan(0);
    expect(result.passes[0]!.candidates).toBeGreaterThan(0);
    expect(result.warnings.filter((w) => w.includes("rejected"))).toEqual([]);
  });

  test("all spans are in bounds, monotonic, and non-overlapping in both streams", () => {
    let vttAt = 0;
    let epubAt = 0;
    for (const span of result.spans) {
      expect(span.vttStart).toBeGreaterThanOrEqual(vttAt);
      expect(span.epubStart).toBeGreaterThanOrEqual(epubAt);
      expect(span.vttEnd).toBeGreaterThan(span.vttStart);
      expect(span.epubEnd).toBeGreaterThan(span.epubStart);
      vttAt = span.vttEnd;
      epubAt = span.epubEnd;
    }
    expect(vttAt).toBeLessThanOrEqual(result.vtt.words.length);
    expect(epubAt).toBeLessThanOrEqual(result.epub.tokens.length);
  });

  test("every span is an exact normalized-token match", () => {
    for (const span of result.spans) {
      const vttSlice = result.vtt.words
        .slice(span.vttStart, span.vttEnd)
        .map((w) => w.norm);
      const epubSlice = result.epub.tokens
        .slice(span.epubStart, span.epubEnd)
        .map((t) => t.norm);
      expect(vttSlice).toEqual(epubSlice);
    }
  });

  test("gaps tile the streams around the spans", () => {
    const covered =
      result.spans.reduce((n, s) => n + (s.vttEnd - s.vttStart), 0) +
      result.gaps.reduce((n, g) => n + (g.vttEnd - g.vttStart), 0);
    expect(covered).toBe(result.vtt.words.length);
  });

  test("metrics report the raw vector without silent exclusions", () => {
    const m = result.metrics;
    expect(m.vttTokens).toBe(result.vtt.words.length);
    expect(m.epubTokens).toBe(result.epub.tokens.length);
    expect(m.spanCount).toBe(result.spans.length);
    expect(m.vttCoverage).toBeGreaterThan(0);
    expect(m.vttCoverage).toBeLessThanOrEqual(1);
    expect(m.epubCoverage).toBeGreaterThan(0);
    expect(m.epubCoverage).toBeLessThanOrEqual(1);
    // Every spine doc is reported, including the one-token image wrappers.
    expect(m.spines.length).toBe(result.epub.spineDocs.length);
    expect(m.anchorDensity.length).toBeGreaterThan(0);
  });

  test("repeated runs are deterministic", async () => {
    const again = await alignBook(vttText, config.aliceEpub);
    expect(again.spans).toEqual(result.spans);
    expect(again.gaps).toEqual(result.gaps);
    expect(again.metrics).toEqual(result.metrics);
  });
});
