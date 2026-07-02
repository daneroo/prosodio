import { describe, expect, test } from "bun:test";
import { runExactPass, type PassWindow } from "./exact-pass.ts";

const words = (s: string) => s.split(" ");
const fullWindow = (vtt: string[], epub: string[]): PassWindow => ({
  vttStart: 0,
  vttEnd: vtt.length,
  epubStart: 0,
  epubEnd: epub.length,
});
const params = {
  passId: "pass1-exact-k6",
  ngramSize: 6,
  uniquenessScope: "global" as const,
};

describe("runExactPass", () => {
  test("identical streams coalesce into one full-width span", () => {
    const vtt = words("the quick brown fox jumps over a lazy dog today");
    const epub = [...vtt];
    const { spans } = runExactPass(vtt, epub, params, fullWindow(vtt, epub));
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      passId: "pass1-exact-k6",
      vttStart: 0,
      vttEnd: vtt.length,
      epubStart: 0,
      epubEnd: epub.length,
    });
    expect(spans[0]!.evidence.anchors).toBe(5);
  });

  test("an insertion in one stream splits the span around it", () => {
    const shared1 = words("alpha beta gamma delta epsilon zeta eta");
    const shared2 = words("one two three four five six seven");
    const vtt = [...shared1, ...shared2];
    const epub = [...shared1, "INSERTED", ...shared2];
    const { spans } = runExactPass(vtt, epub, params, fullWindow(vtt, epub));
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      vttStart: 0,
      vttEnd: 7,
      epubStart: 0,
      epubEnd: 7,
    });
    expect(spans[1]).toMatchObject({
      vttStart: 7,
      vttEnd: 14,
      epubStart: 8,
      epubEnd: 15,
    });
  });

  test("n-grams repeated within a stream are never candidates", () => {
    const refrain = words("row row row your boat gently down"); // k=6 windows repeat
    const vtt = [...refrain, ...refrain];
    const epub = [...refrain, ...refrain];
    const { spans } = runExactPass(vtt, epub, params, fullWindow(vtt, epub));
    // The 4 duplicated n-grams (2 per repetition edge) are excluded, leaving
    // only the 5 unique seam-crossing anchors; exact extension then covers the
    // identical streams end to end.
    expect(spans).toHaveLength(1);
    expect(spans[0]!.evidence.anchors).toBe(5);
    expect(spans[0]).toMatchObject({
      vttStart: 0,
      vttEnd: 14,
      epubStart: 0,
      epubEnd: 14,
    });
  });

  test("exact extension claims matching tokens no unique n-gram covers", () => {
    const k3 = {
      passId: "p",
      ngramSize: 3,
      uniquenessScope: "global" as const,
    };
    const vtt = words("a b c d e a b c x q r s");
    const epub = words("a b c d e a b c y q r s");
    const { spans } = runExactPass(vtt, epub, k3, fullWindow(vtt, epub));
    // "a b c" repeats, so no unique n-gram covers the leading a or the second
    // c — exact extension claims both (left 1, right 1 around the anchors).
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      vttStart: 0,
      vttEnd: 8,
      epubStart: 0,
      epubEnd: 8,
    });
    expect(spans[0]!.evidence.extendedLeft).toBe(1);
    expect(spans[0]!.evidence.extendedRight).toBe(1);
    expect(spans[1]).toMatchObject({
      vttStart: 9,
      vttEnd: 12,
      epubStart: 9,
      epubEnd: 12,
    });
  });

  test("LIS keeps the maximum monotonic chain when a block moves", () => {
    const a = words("alpha beta gamma delta epsilon zeta");
    const b = words("one two three four five six");
    const c = words("red orange yellow green blue indigo");
    const vtt = [...a, ...b, ...c];
    const epub = [...b, ...c, ...a]; // `a` moved to the end
    const { spans } = runExactPass(vtt, epub, params, fullWindow(vtt, epub));
    // Monotonic: keeps b+c (adjacent in both streams, so one contiguous span)
    // and drops the moved a rather than letting it invert the chain.
    expect(spans).toHaveLength(1);
    expect(vtt.slice(spans[0]!.vttStart, spans[0]!.vttEnd).join(" ")).toBe(
      [...b, ...c].join(" "),
    );
  });

  test("spans stay inside the given window (gap-scoped reuse)", () => {
    const vtt = words("x0 x1 alpha beta gamma delta epsilon zeta x2 x3");
    const epub = words("y0 alpha beta gamma delta epsilon zeta y1");
    const { spans } = runExactPass(
      vtt,
      epub,
      { passId: "proof-k4", ngramSize: 4, uniquenessScope: "gap" },
      { vttStart: 2, vttEnd: 8, epubStart: 1, epubEnd: 7 },
    );
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      vttStart: 2,
      vttEnd: 8,
      epubStart: 1,
      epubEnd: 7,
    });
  });
});
