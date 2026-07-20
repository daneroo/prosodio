import { describe, expect, test } from "bun:test";
import { postProbeFindings } from "./findings.ts";
import type { ProbeResult } from "./ffprobe.ts";
import type { BookRecord } from "./types.ts";

function stubBook(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    id: "abc123def456",
    basename: "Author - Book One",
    rootName: "fixtures",
    relDir: "Author - Book One",
    m4bRelPath: "Author - Book One/Author - Book One.m4b",
    coverRelPath: "Author - Book One/cover.jpg",
    epubRelPath: null,
    epubMatch: "absent",
    hasVtt: false,
    vttMatch: "absent",
    metadata: {
      title: "Book One",
      author: "Author",
      series: [],
      narrator: null,
      source: "tags",
      durationSec: null,
      bitrateKbps: null,
      codec: null,
      sizeBytes: 0,
    },
    fingerprint: {
      relPath: "Author - Book One/Author - Book One.m4b",
      mtimeMs: 0,
      size: 0,
    },
    ...overrides,
  };
}

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

describe("postProbeFindings — bad-duration", () => {
  test("duration <= 0 after a successful probe is a bad-duration failure", () => {
    const book = stubBook();
    const findings = postProbeFindings(book, stubProbe({ durationSec: 0 }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("bad-duration");
    expect(findings[0]?.bookId).toBe(book.id);
    expect(findings[0]?.relDir).toBe(book.relDir);
    expect(findings[0]?.severity).toBe("failure");
  });

  test("negative duration is also bad-duration", () => {
    const findings = postProbeFindings(
      stubBook(),
      stubProbe({ durationSec: -1 }),
    );
    expect(findings.map((f) => f.code)).toContain("bad-duration");
  });

  test("null duration (probe failure — 'unprobed') is never a finding", () => {
    const findings = postProbeFindings(
      stubBook(),
      stubProbe({ durationSec: null }),
    );
    expect(findings).toHaveLength(0);
  });

  test("a positive duration is clean", () => {
    const findings = postProbeFindings(
      stubBook(),
      stubProbe({ durationSec: 3600 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe("postProbeFindings — metadata-missing-author", () => {
  test("title tag present, artist tag absent is a metadata-missing-author warning", () => {
    const book = stubBook();
    const findings = postProbeFindings(
      book,
      stubProbe({ titleTag: "Book One", artistTag: null }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("metadata-missing-author");
    expect(findings[0]?.bookId).toBe(book.id);
    expect(findings[0]?.severity).toBe("warning");
  });

  test("both title and artist tags present is clean", () => {
    const findings = postProbeFindings(
      stubBook(),
      stubProbe({ titleTag: "Book One", artistTag: "Author" }),
    );
    expect(findings).toHaveLength(0);
  });

  test("no title tag at all is not this finding (that's metadata-basename-fallback's territory)", () => {
    const findings = postProbeFindings(
      stubBook(),
      stubProbe({ titleTag: null, artistTag: null }),
    );
    expect(findings).toHaveLength(0);
  });

  test("both bad-duration and metadata-missing-author can fire together", () => {
    const findings = postProbeFindings(
      stubBook(),
      stubProbe({ durationSec: 0, titleTag: "Book One", artistTag: null }),
    );
    // Order matches push order in postProbeFindings (duration check first).
    expect(findings.map((f) => f.code)).toEqual([
      "bad-duration",
      "metadata-missing-author",
    ]);
  });
});
