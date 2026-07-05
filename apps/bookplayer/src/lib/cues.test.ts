import { describe, expect, test } from "bun:test";

import { activeCueIndex, activeTokenIndex } from "./cues.ts";

const cues = [
  { startSec: 0, endSec: 2 },
  { startSec: 2, endSec: 5 },
  { startSec: 7, endSec: 9 },
];

describe("activeCueIndex", () => {
  test("finds the containing cue", () => {
    expect(activeCueIndex(cues, 0)).toBe(0);
    expect(activeCueIndex(cues, 3.5)).toBe(1);
    expect(activeCueIndex(cues, 7)).toBe(2);
  });

  test("half-open ends: a cue's endSec belongs to the next cue", () => {
    expect(activeCueIndex(cues, 2)).toBe(1);
  });

  test("-1 outside all cues (gaps, before start, after end, empty)", () => {
    expect(activeCueIndex(cues, 6)).toBe(-1);
    expect(activeCueIndex(cues, -1)).toBe(-1);
    expect(activeCueIndex(cues, 99)).toBe(-1);
    expect(activeCueIndex([], 1)).toBe(-1);
  });
});

describe("activeTokenIndex", () => {
  // Same interval semantics as cues, applied to a cue's tokens.
  const tokens = [
    { startSec: 0, endSec: 1 },
    { startSec: 1, endSec: 2 },
    { startSec: 2, endSec: 5 },
  ];

  test("selects the token whose interval contains t (half-open)", () => {
    expect(activeTokenIndex(tokens, 0)).toBe(0);
    expect(activeTokenIndex(tokens, 1)).toBe(1);
    expect(activeTokenIndex(tokens, 4.9)).toBe(2);
  });

  test("-1 before the first and at/after the last token end", () => {
    expect(activeTokenIndex(tokens, -0.1)).toBe(-1);
    expect(activeTokenIndex(tokens, 5)).toBe(-1);
  });
});
