import { describe, expect, test } from "bun:test";
import { interpolateWordTimes } from "./cue-times.ts";

describe("interpolateWordTimes", () => {
  test("count 1 places the single word at the cue start", () => {
    expect(interpolateWordTimes(10, 12, 1)).toEqual([10]);
  });

  test("count n spreads words evenly across the cue span", () => {
    expect(interpolateWordTimes(0, 4, 4)).toEqual([0, 1, 2, 3]);
    expect(interpolateWordTimes(10, 20, 5)).toEqual([10, 12, 14, 16, 18]);
  });

  test("zero-length cue yields all words at the same instant", () => {
    expect(interpolateWordTimes(5, 5, 3)).toEqual([5, 5, 5]);
  });

  test("count 0 yields an empty array", () => {
    expect(interpolateWordTimes(0, 10, 0)).toEqual([]);
  });
});
