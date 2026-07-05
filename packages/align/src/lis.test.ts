import { describe, expect, test } from "bun:test";
import { longestIncreasingSubsequence } from "./lis.ts";

const pick = (values: number[]) =>
  longestIncreasingSubsequence(values).map((i) => values[i]);

describe("longestIncreasingSubsequence", () => {
  test("the design's bisection counterexample keeps 1,2,3,4 not 1,2,100", () => {
    expect(pick([1, 2, 100, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  test("already increasing input is kept whole", () => {
    expect(pick([1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("strictly decreasing input keeps one element", () => {
    expect(pick([5, 4, 3])).toHaveLength(1);
  });

  test("strict increase — equal values cannot chain", () => {
    expect(pick([2, 2, 2])).toHaveLength(1);
  });

  test("empty input", () => {
    expect(pick([])).toEqual([]);
  });

  test("returns indices in increasing order", () => {
    const values = [10, 1, 11, 2, 12, 3, 13];
    const indices = longestIncreasingSubsequence(values);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
      expect(values[indices[i]!]!).toBeGreaterThan(values[indices[i - 1]!]!);
    }
    expect(indices).toHaveLength(4); // 1, 2, 3, 13 (or 10,11,12,13)
  });
});
