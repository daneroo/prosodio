import { describe, expect, test } from "bun:test";
import { extractMetadata, parseGrouping } from "./metadata.ts";
import type { ProbeResult } from "./ffprobe.ts";

function stubProbe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    durationSec: null,
    bitrateKbps: null,
    codec: null,
    titleTag: null,
    artistTag: null,
    groupingTag: null,
    composerTag: null,
    ...overrides,
  };
}

describe("parseGrouping", () => {
  test("single series with a position", () => {
    expect(parseGrouping("Discworld #34")).toEqual([
      { name: "Discworld", position: 34 },
    ]);
  });

  test("multi-series round-trips two entries, keeping a colon in the name", () => {
    expect(
      parseGrouping("Discworld #34; Discworld: Ankh-Morpork City Watch #7"),
    ).toEqual([
      { name: "Discworld", position: 34 },
      { name: "Discworld: Ankh-Morpork City Watch", position: 7 },
    ]);
  });

  test("name-only junk value (no series shape) parses as name, null position", () => {
    expect(parseGrouping("Adult")).toEqual([{ name: "Adult", position: null }]);
  });

  test("fractional position", () => {
    expect(parseGrouping("Novella #3.5")).toEqual([
      { name: "Novella", position: 3.5 },
    ]);
  });

  test("null and empty string give no series", () => {
    expect(parseGrouping(null)).toEqual([]);
    expect(parseGrouping("")).toEqual([]);
  });
});

describe("extractMetadata", () => {
  test("clean tags win over a structured 'Author - Title' basename", () => {
    const probe = stubProbe({ titleTag: "Tag Title", artistTag: "Tag Author" });
    const result = extractMetadata(probe, "Basename Author - Basename Title");
    expect(result.title).toBe("Tag Title");
    expect(result.author).toBe("Tag Author");
    expect(result.usedBasenameFallback).toBe(false);
  });

  test("title tag present, artist tag null: author is null, no basename backfill", () => {
    const probe = stubProbe({ titleTag: "Tag Title", artistTag: null });
    const result = extractMetadata(probe, "Basename Author - Basename Title");
    expect(result.title).toBe("Tag Title");
    expect(result.author).toBeNull();
    expect(result.usedBasenameFallback).toBe(false);
  });

  test("title tag absent: falls back to the basename parse", () => {
    const probe = stubProbe();
    const result = extractMetadata(probe, "Author - Book One");
    expect(result.title).toBe("Book One");
    expect(result.author).toBe("Author");
    expect(result.usedBasenameFallback).toBe(true);
  });

  test("all-null probe (jfk.m4b fixture case): basename fallback, empty series, null narrator", () => {
    const probe = stubProbe();
    const result = extractMetadata(probe, "jfk");
    expect(result.title).toBe("jfk");
    expect(result.author).toBeNull();
    expect(result.series).toEqual([]);
    expect(result.narrator).toBeNull();
    expect(result.usedBasenameFallback).toBe(true);
  });
});
