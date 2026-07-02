import { describe, expect, test } from "bun:test";
import type { MatchedSpan, SpanEvidence } from "./contracts.ts";
import { computeGaps, reconcile } from "./reconcile.ts";

const evidence: SpanEvidence = {
  kind: "exact-unique-ngram",
  ngramSize: 6,
  uniquenessScope: "global",
  anchors: 1,
  extendedLeft: 0,
  extendedRight: 0,
};

const span = (
  vttStart: number,
  vttEnd: number,
  epubStart: number,
  epubEnd: number,
): MatchedSpan => ({
  passId: "test",
  vttStart,
  vttEnd,
  epubStart,
  epubEnd,
  evidence,
});

const bounds = { vttLength: 100, epubLength: 100 };

describe("reconcile", () => {
  const anchors = [span(10, 20, 10, 20), span(40, 50, 40, 50)];

  test("accepts a candidate inside a residual gap", () => {
    const { accepted, rejected } = reconcile(
      anchors,
      [span(25, 30, 25, 30)],
      bounds,
    );
    expect(rejected).toEqual([]);
    expect(accepted.map((s) => s.vttStart)).toEqual([10, 25, 40]);
  });

  test("rejects overlap on either axis", () => {
    expect(
      reconcile(anchors, [span(15, 25, 60, 70)], bounds).rejected[0]!.reason,
    ).toBe("overlaps an accepted span (vtt)");
    expect(
      reconcile(anchors, [span(60, 70, 15, 25)], bounds).rejected[0]!.reason,
    ).toBe("overlaps an accepted span (epub)");
  });

  test("rejects a candidate that crosses an anchor", () => {
    // Before the first anchor in VTT but after it in EPUB.
    const { rejected } = reconcile(anchors, [span(0, 5, 25, 30)], bounds);
    expect(rejected[0]!.reason).toBe("crosses an accepted span");
  });

  test("rejects out-of-bounds and inverted ranges", () => {
    expect(
      reconcile([], [span(90, 105, 0, 15)], bounds).rejected[0]!.reason,
    ).toBe("out of stream bounds");
    expect(reconcile([], [span(5, 5, 5, 6)], bounds).rejected[0]!.reason).toBe(
      "empty or inverted range",
    );
  });

  test("never mutates existing accepted spans", () => {
    const frozen = structuredClone(anchors);
    reconcile(anchors, [span(25, 30, 25, 30)], bounds);
    expect(anchors).toEqual(frozen);
  });
});

describe("computeGaps", () => {
  test("emits leading, interior, and trailing gaps", () => {
    const gaps = computeGaps(
      [span(10, 20, 15, 25), span(40, 50, 45, 55)],
      bounds,
    );
    expect(gaps).toEqual([
      { vttStart: 0, vttEnd: 10, epubStart: 0, epubEnd: 15 },
      { vttStart: 20, vttEnd: 40, epubStart: 25, epubEnd: 45 },
      { vttStart: 50, vttEnd: 100, epubStart: 55, epubEnd: 100 },
    ]);
  });

  test("keeps gaps empty on one side only, drops fully empty ones", () => {
    const gaps = computeGaps([span(0, 10, 0, 20), span(10, 30, 20, 40)], {
      vttLength: 30,
      epubLength: 50,
    });
    expect(gaps).toEqual([
      { vttStart: 30, vttEnd: 30, epubStart: 40, epubEnd: 50 },
    ]);
  });

  test("no spans yields one whole-stream gap", () => {
    expect(computeGaps([], bounds)).toEqual([
      { vttStart: 0, vttEnd: 100, epubStart: 0, epubEnd: 100 },
    ]);
  });
});
