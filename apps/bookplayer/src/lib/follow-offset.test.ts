import { describe, expect, test } from "bun:test";

import {
  DEFAULT_OFFSET_SEC,
  applyOffset,
  nudgeOffset,
  parseStoredOffset,
} from "./follow-offset.ts";

const reading = { audioPosition: 100, frozen: false, tickAgeMs: 3000 };

describe("follow offset", () => {
  test("is scaled by the rate: real seconds become audio seconds", () => {
    expect(applyOffset(reading, 1, 1.7).audioPosition).toBeCloseTo(101.7);
    expect(applyOffset(reading, -0.5, 2).audioPosition).toBeCloseTo(99);
  });

  test("is zero at offset 0, leaving the rest of the reading unchanged", () => {
    expect(applyOffset(reading, 0, 1.7)).toEqual(reading);
  });

  test("nudges in 0.1 s steps without float drift", () => {
    let offset = DEFAULT_OFFSET_SEC;
    for (let i = 0; i < 3; i++) offset = nudgeOffset(offset, 1);
    expect(offset).toBe(1.3);
    for (let i = 0; i < 14; i++) offset = nudgeOffset(offset, -1);
    expect(offset).toBe(-0.1);
  });

  test("restores a stored offset, including 0; defaults to +1.0 s", () => {
    expect(DEFAULT_OFFSET_SEC).toBe(1);
    expect(parseStoredOffset("0.7")).toBe(0.7);
    expect(parseStoredOffset("0")).toBe(0);
    expect(parseStoredOffset("-0.3")).toBe(-0.3);
    expect(parseStoredOffset(null)).toBe(1);
    expect(parseStoredOffset("")).toBe(1);
    expect(parseStoredOffset("abc")).toBe(1);
  });
});
