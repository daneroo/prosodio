import { describe, expect, test } from "bun:test";

import {
  applyFilters,
  compareBy,
  formatDuration,
  searchRows,
} from "./browse.ts";
import type { BrowseRow } from "./browse.ts";

function row(overrides: Partial<BrowseRow> & { title: string }): BrowseRow {
  return {
    author: null,
    durationSec: null,
    hasEpub: false,
    hasVtt: false,
    ...overrides,
  };
}

const BOTH = row({ title: "both", hasEpub: true, hasVtt: true });
const EPUB_ONLY = row({ title: "epub-only", hasEpub: true });
const VTT_ONLY = row({ title: "vtt-only", hasVtt: true });
const NEITHER = row({ title: "neither" });
const ALL = [BOTH, EPUB_ONLY, VTT_ONLY, NEITHER];

describe("applyFilters truth table (seed contract)", () => {
  test("both checked: only books with EPUB and VTT", () => {
    expect(applyFilters(ALL, { epub: true, vtt: true })).toEqual([BOTH]);
  });

  test("only EPUB: books with EPUB", () => {
    expect(applyFilters(ALL, { epub: true, vtt: false })).toEqual([
      BOTH,
      EPUB_ONLY,
    ]);
  });

  test("only VTT: books with VTT", () => {
    expect(applyFilters(ALL, { epub: false, vtt: true })).toEqual([
      BOTH,
      VTT_ONLY,
    ]);
  });

  test("both unchecked: all canonical books", () => {
    expect(applyFilters(ALL, { epub: false, vtt: false })).toEqual(ALL);
  });
});

describe("compareBy", () => {
  const rows = [
    row({ title: "b", author: "Zed", durationSec: 10 }),
    row({ title: "a", author: null, durationSec: 30 }),
    row({ title: "c", author: "Amy", durationSec: null }),
  ];

  test("title ascending", () => {
    expect([...rows].sort(compareBy("title")).map((r) => r.title)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("author ascending with authorless last", () => {
    expect([...rows].sort(compareBy("author")).map((r) => r.author)).toEqual([
      "Amy",
      "Zed",
      null,
    ]);
  });

  test("duration descending with unknown last", () => {
    expect(
      [...rows].sort(compareBy("duration")).map((r) => r.durationSec),
    ).toEqual([30, 10, null]);
  });
});

describe("searchRows", () => {
  const rows = [
    row({ title: "Use Of Weapons", author: "Iain M. Banks" }),
    row({ title: "Alice", author: "Lewis Carroll" }),
  ];

  test("matches title or author, case-insensitive", () => {
    expect(searchRows(rows, "weapons")).toHaveLength(1);
    expect(searchRows(rows, "CARROLL")).toHaveLength(1);
    expect(searchRows(rows, "")).toHaveLength(2);
    expect(searchRows(rows, "zzz")).toHaveLength(0);
  });
});

describe("formatDuration", () => {
  test("HH:MM:SS and unknown", () => {
    expect(formatDuration(12932.79)).toBe("03:35:32");
    expect(formatDuration(59)).toBe("00:00:59");
    expect(formatDuration(null)).toBe("—");
  });
});
