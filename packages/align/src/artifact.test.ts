import { describe, expect, test } from "bun:test";
import {
  ALIGNMENT_ARTIFACT_SCHEMA_VERSION,
  alignmentArtifactSchema,
  buildAlignmentArtifact,
  type AlignmentArtifact,
  type ArtifactSource,
} from "./artifact.ts";
import { alignBook } from "./align-book.ts";
import { aliceEpubBytes, fixturePaths } from "./fixture-paths.ts";

const vttText = await Bun.file(fixturePaths.aliceVtt).text();
const epubBytes = await aliceEpubBytes();
const source: ArtifactSource = {
  root: "fixtures",
  base: "Lewis Carroll - Alices Adventures in Wonderland",
};

describe("buildAlignmentArtifact", async () => {
  const alignment = await alignBook(vttText, epubBytes);
  const artifact = buildAlignmentArtifact(alignment, source);

  test("validates against the strict schema and survives a JSON round-trip", () => {
    const reparsed = alignmentArtifactSchema.parse(
      JSON.parse(JSON.stringify(artifact)),
    );
    expect(reparsed).toEqual(artifact);
  });

  test("schema version and features are as declared", () => {
    expect(artifact.schemaVersion).toBe(ALIGNMENT_ARTIFACT_SCHEMA_VERSION);
    expect(artifact.features).toEqual([]);
  });

  test("vtt token columns are parallel and cueIndex values slice back to raw text", () => {
    const { cues, tokens } = artifact.vtt;
    expect(tokens.charStart.length).toBe(tokens.cueIndex.length);
    expect(tokens.charEnd.length).toBe(tokens.cueIndex.length);
    expect(tokens.cueIndex.length).toBe(alignment.vtt.words.length);

    for (const word of alignment.vtt.words) {
      expect(tokens.cueIndex[word.seq]).toBe(word.cueIndex);
      expect(tokens.charStart[word.seq]).toBe(word.charStart);
      expect(tokens.charEnd[word.seq]).toBe(word.charEnd);
      const cueText = cues.text[word.cueIndex]!;
      expect(cueText.slice(word.charStart, word.charEnd)).toBe(word.raw);
    }
  });

  test("cueIndex is non-decreasing", () => {
    let last = -1;
    for (const cueIndex of artifact.vtt.tokens.cueIndex) {
      expect(cueIndex).toBeGreaterThanOrEqual(last);
      last = cueIndex;
    }
  });

  test("epub locator columns match the extraction's dom.tokenLocators", () => {
    const { tokens } = artifact.epub;
    expect(tokens.spineIndex.length).toBe(alignment.epub.tokens.length);
    alignment.epub.tokens.forEach((token, epubSeq) => {
      const doc = alignment.epub.spineDocs[token.spineIndex]!;
      const locator = doc.dom.tokenLocators[token.tokenIndex]!;
      expect(tokens.spineIndex[epubSeq]).toBe(token.spineIndex);
      expect(tokens.startSeg[epubSeq]).toBe(locator.startSeg);
      expect(tokens.startOffset[epubSeq]).toBe(locator.startOffset);
      expect(tokens.endSeg[epubSeq]).toBe(locator.endSeg);
      expect(tokens.endOffset[epubSeq]).toBe(locator.endOffset);
    });
  });

  test("epub spines carry segPaths/segTextLen for every spine doc, including excluded ones", () => {
    expect(artifact.epub.spines.length).toBe(alignment.epub.spineDocs.length);
    alignment.epub.spineDocs.forEach((doc, i) => {
      const spine = artifact.epub.spines[i]!;
      expect(spine.href).toBe(doc.spineHref);
      expect(spine.parseMode).toBe(doc.parseMode);
      expect(spine.segPaths).toEqual(doc.dom.segPaths);
      expect(spine.segTextLen).toEqual(doc.dom.segTextLen);
      expect(spine.segTextLen.length).toBe(spine.segPaths.length);
    });
  });

  test("match block carries spans (no addresses/vttStartSec/vttEndSec), gaps, and metrics unchanged", () => {
    expect(artifact.match.spans.length).toBe(alignment.spans.length);
    for (const [i, span] of artifact.match.spans.entries()) {
      const source = alignment.spans[i]!;
      expect(span.passId).toBe(source.passId);
      expect(span.vttStart).toBe(source.vttStart);
      expect(span.vttEnd).toBe(source.vttEnd);
      expect(span.epubStart).toBe(source.epubStart);
      expect(span.epubEnd).toBe(source.epubEnd);
      expect(span.evidence).toEqual(source.evidence);
      expect(span).not.toHaveProperty("addresses");
      expect(span).not.toHaveProperty("vttStartSec");
      expect(span).not.toHaveProperty("vttEndSec");
    }
    expect(artifact.match.gaps).toEqual(alignment.gaps);
    expect(artifact.match.metrics).toEqual(alignment.metrics);
  });

  test("serialization is deterministic byte-for-byte", async () => {
    const again = buildAlignmentArtifact(
      await alignBook(vttText, epubBytes),
      source,
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify(artifact));
  });

  test("cue times are rounded to millisecond precision", () => {
    for (const startSec of artifact.vtt.cues.startSec) {
      expect(startSec).toBe(Math.round(startSec * 1000) / 1000);
    }
    for (const endSec of artifact.vtt.cues.endSec) {
      expect(endSec).toBe(Math.round(endSec * 1000) / 1000);
    }
  });

  test("source block carries no filesystem paths (Codex review #1)", () => {
    // The artifact is served straight to the browser; absolute paths belong
    // only in the server cache sidecar and the local CLI report (ResultSource
    // in result.ts). Assert the exact public field set, and that neither
    // fixture path leaked in under a different key.
    expect(Object.keys(artifact.source).sort()).toEqual(
      ["base", "root", "vttProvenance", "vttTiming"].sort(),
    );
    for (const value of Object.values(artifact.source)) {
      expect(value).not.toBe(fixturePaths.aliceVtt);
      expect(value).not.toBe(fixturePaths.aliceEpub);
    }
  });

  test("float noise in cue seconds rounds to 3 decimals", () => {
    const tampered: AlignmentArtifact = {
      ...artifact,
      vtt: {
        ...artifact.vtt,
        cues: {
          ...artifact.vtt.cues,
          startSec: [0.1 + 0.2, ...artifact.vtt.cues.startSec.slice(1)],
        },
      },
    };
    // buildAlignmentArtifact rounds at construction time; here we assert the
    // rounding helper's contract directly against the float-noise case the
    // plan calls out (0.1 + 0.2 !== 0.3 in IEEE 754).
    const rounded = Math.round(tampered.vtt.cues.startSec[0]! * 1000) / 1000;
    expect(rounded).toBe(0.3);
  });
});

describe("alignmentArtifactSchema invariant violations", () => {
  type Span = AlignmentArtifact["match"]["spans"][number];

  function span(overrides: Partial<Span>): Span {
    return {
      passId: "p1",
      vttStart: 0,
      vttEnd: 1,
      epubStart: 0,
      epubEnd: 1,
      evidence: {
        kind: "exact-unique-ngram",
        ngramSize: 3,
        uniquenessScope: "global",
        anchors: 1,
        extendedLeft: 0,
        extendedRight: 0,
      },
      ...overrides,
    };
  }

  const baseSource = {
    schemaVersion: ALIGNMENT_ARTIFACT_SCHEMA_VERSION,
    features: [],
    source: {
      root: "fixtures",
      base: "synthetic",
      vttTiming: "word" as const,
      vttProvenance: null,
    },
    config: {
      normalizationPolicy: "strict-nfkc-v1",
      pass1NgramSize: 6,
      proofNgramSize: 4,
      extraction: {
        includeNonLinearSpineItems: true,
        excludedElements: ["head", "script", "style"],
        domParser: "jsdom" as const,
        parseMode: "xhtml-or-html-fallback" as const,
      },
    },
    match: {
      // Two adjacent, equal-width, in-bounds spans plus one bounds-respecting
      // gap, sized against the vtt (3 tokens) / epub (2 tokens) columns below
      // — a realistic baseline the span-invariant tests tamper individually.
      spans: [
        span({ vttStart: 0, vttEnd: 1, epubStart: 0, epubEnd: 1 }),
        span({ vttStart: 1, vttEnd: 2, epubStart: 1, epubEnd: 2 }),
      ],
      gaps: [{ vttStart: 2, vttEnd: 3, epubStart: 2, epubEnd: 2 }],
      metrics: {
        passes: [],
        vttTokens: 3,
        epubTokens: 2,
        vttMatchedTokens: 2,
        epubMatchedTokens: 2,
        vttCoverage: 0.67,
        epubCoverage: 1,
        spanCount: 2,
        gapCount: 1,
        gapVttTokens: { count: 1, min: 1, max: 1, mean: 1, median: 1 },
        gapEpubTokens: { count: 1, min: 0, max: 0, mean: 0, median: 0 },
        gapSeconds: { count: 1, min: 0, max: 0, mean: 0, median: 0 },
        spines: [],
        anchorDensity: [],
        anomalies: [],
        warnings: [],
      },
    },
  };

  function validArtifact(): AlignmentArtifact {
    return {
      ...baseSource,
      schemaVersion: ALIGNMENT_ARTIFACT_SCHEMA_VERSION as 2,
      vtt: {
        cues: { startSec: [0, 1], endSec: [1, 2], text: ["one two", "three"] },
        tokens: {
          cueIndex: [0, 0, 1],
          charStart: [0, 4, 0],
          charEnd: [3, 7, 5],
        },
      },
      epub: {
        spines: [
          {
            href: "chapter1.xhtml",
            parseMode: "xhtml",
            segPaths: [[0], [1]],
            segTextLen: [3, 5],
          },
        ],
        tokens: {
          spineIndex: [0, 0],
          startSeg: [0, 1],
          startOffset: [0, 0],
          endSeg: [0, 1],
          endOffset: [3, 5],
        },
      },
    };
  }

  test("a valid synthetic artifact parses", () => {
    expect(() => alignmentArtifactSchema.parse(validArtifact())).not.toThrow();
  });

  test("dropped vtt.tokens.charEnd entry is rejected", () => {
    const artifact = validArtifact();
    artifact.vtt.tokens.charEnd = artifact.vtt.tokens.charEnd.slice(0, -1);
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  test("decreasing cueIndex is rejected", () => {
    const artifact = validArtifact();
    artifact.vtt.tokens.cueIndex = [0, 1, 0];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  test("out-of-range cueIndex is rejected", () => {
    const artifact = validArtifact();
    artifact.vtt.tokens.cueIndex = [0, 0, 5];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  test("mismatched vtt.cues column lengths are rejected", () => {
    const artifact = validArtifact();
    artifact.vtt.cues.endSec = [1];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  test("mismatched epub.tokens column lengths are rejected", () => {
    const artifact = validArtifact();
    artifact.epub.tokens.endOffset = artifact.epub.tokens.endOffset.slice(
      0,
      -1,
    );
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  test("decreasing spineIndex is rejected", () => {
    const artifact = validArtifact();
    artifact.epub.spines.push({
      href: "chapter2.xhtml",
      parseMode: "xhtml",
      segPaths: [[0]],
      segTextLen: [4],
    });
    artifact.epub.tokens.spineIndex = [1, 0];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  test("out-of-range spineIndex is rejected", () => {
    const artifact = validArtifact();
    artifact.epub.tokens.spineIndex = [0, 3];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  test("segPaths/segTextLen length mismatch per spine is rejected", () => {
    const artifact = validArtifact();
    artifact.epub.spines[0]!.segTextLen = [3];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });

  // A wider token budget (4 vtt / 4 epub tokens) than validArtifact()'s,
  // used only by the overlap tests below so overlapping spans can be crafted
  // without also tripping the bounds checks.
  function wideValidArtifact(): AlignmentArtifact {
    const artifact = validArtifact();
    artifact.vtt.tokens = {
      cueIndex: [0, 0, 1, 1],
      charStart: [0, 4, 0, 0],
      charEnd: [3, 7, 5, 5],
    };
    artifact.epub.tokens = {
      spineIndex: [0, 0, 0, 0],
      startSeg: [0, 0, 0, 0],
      startOffset: [0, 0, 0, 0],
      endSeg: [0, 0, 0, 0],
      endOffset: [0, 0, 0, 0],
    };
    return artifact;
  }

  test("zero-width span (vttEnd === vttStart and epubEnd === epubStart) is rejected", () => {
    const artifact = validArtifact();
    artifact.match.spans = [
      span({ vttStart: 1, vttEnd: 1, epubStart: 1, epubEnd: 1 }),
    ];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.spans\[0\] vtt range is empty/,
    );
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.spans\[0\] epub range is empty/,
    );
  });

  test("unequal vtt/epub span widths are rejected (deriveEpubSeq requires equal width)", () => {
    const artifact = validArtifact();
    artifact.match.spans = [
      span({ vttStart: 0, vttEnd: 2, epubStart: 0, epubEnd: 1 }),
    ];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.spans\[0\] width mismatch: vtt width 2 !== epub width 1/,
    );
  });

  test("span vttEnd past the vtt token table is rejected", () => {
    const artifact = validArtifact();
    artifact.match.spans = [
      span({ vttStart: 2, vttEnd: 4, epubStart: 0, epubEnd: 2 }),
    ];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.spans\[0\] vttEnd 4 out of bounds for 3 vtt tokens/,
    );
  });

  test("span epubEnd past the epub token table is rejected", () => {
    const artifact = validArtifact();
    artifact.match.spans = [
      span({ vttStart: 0, vttEnd: 2, epubStart: 1, epubEnd: 3 }),
    ];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.spans\[0\] epubEnd 3 out of bounds for 2 epub tokens/,
    );
  });

  test("overlapping spans on the vtt axis are rejected", () => {
    const artifact = wideValidArtifact();
    artifact.match.spans = [
      span({ vttStart: 0, vttEnd: 2, epubStart: 0, epubEnd: 2 }),
      span({ vttStart: 1, vttEnd: 3, epubStart: 2, epubEnd: 4 }),
    ];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.spans\[1\] overlaps match\.spans\[0\] on the vtt axis/,
    );
  });

  test("overlapping spans on the epub axis are rejected", () => {
    const artifact = wideValidArtifact();
    artifact.match.spans = [
      span({ vttStart: 0, vttEnd: 2, epubStart: 0, epubEnd: 2 }),
      span({ vttStart: 2, vttEnd: 4, epubStart: 1, epubEnd: 3 }),
    ];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.spans\[1\] overlaps match\.spans\[0\] on the epub axis/,
    );
  });

  test("out-of-bounds gap is rejected (gaps get the bounds check but not non-empty/equal-width)", () => {
    const artifact = validArtifact();
    artifact.match.gaps = [
      { vttStart: 0, vttEnd: 5, epubStart: 0, epubEnd: 1 },
    ];
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow(
      /match\.gaps\[0\] vttEnd 5 out of bounds for 3 vtt tokens/,
    );
  });

  test("strictObject rejects undeclared fields", () => {
    const artifact = validArtifact() as AlignmentArtifact & {
      extra?: string;
    };
    artifact.extra = "unexpected";
    expect(() => alignmentArtifactSchema.parse(artifact)).toThrow();
  });
});
