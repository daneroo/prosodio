import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { deriveEpubSeq } from "./artifact-derive.ts";
import type { AlignmentArtifact } from "./artifact.ts";
import {
  buildSegPathIndex,
  epubSeqAtDomPoint,
  segIndexForTextNode,
  vttSeqForEpubSeq,
} from "./epub-dom-point.ts";
import { resolveNodeAtPath } from "./epub-dom-path.ts";
import { projectVisibleText } from "./epub-extract.ts";

type EpubTokenColumns = AlignmentArtifact["epub"]["tokens"];
type MatchSpan = AlignmentArtifact["match"]["spans"][number];

/** Same parse helper as epub-dom-path.test.ts: xhtml first, html fallback,
 * matching how epub-extract.ts's parseContentDocument resolves a section. */
function parse(html: string): Document {
  try {
    const doc = new JSDOM(html, { contentType: "application/xhtml+xml" }).window
      .document;
    if (doc.getElementsByTagName("parsererror").length === 0) return doc;
  } catch {
    // fall through to the lenient HTML parser
  }
  return new JSDOM(html, { contentType: "text/html" }).window.document;
}

describe("segIndexForTextNode", () => {
  const html =
    "<html><body><p>Hello <em>world</em></p><p>Second block</p></body></html>";

  test("round-trips with resolveNodeAtPath for every seg in the table", () => {
    const { segPaths } = projectVisibleText(html, []);
    const root = parse(html);
    expect(segPaths.length).toBeGreaterThan(1);

    for (let segIndex = 0; segIndex < segPaths.length; segIndex++) {
      const resolved = resolveNodeAtPath(root, segPaths[segIndex]!);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) continue;
      expect(segIndexForTextNode(root, segPaths, resolved.node)).toBe(segIndex);
    }
  });

  test("accepts a prebuilt SegPathIndex identically to the raw array", () => {
    const { segPaths } = projectVisibleText(html, []);
    const root = parse(html);
    const index = buildSegPathIndex(segPaths);
    const resolved = resolveNodeAtPath(root, segPaths[0]!);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(segIndexForTextNode(root, index, resolved.node)).toBe(
      segIndexForTextNode(root, segPaths, resolved.node),
    );
  });

  test("node outside root returns null", () => {
    const { segPaths } = projectVisibleText(html, []);
    const root = parse(html);
    const otherDoc = parse(html);
    const foreignText = otherDoc.querySelector("p")!.firstChild!;
    expect(segIndexForTextNode(root, segPaths, foreignText)).toBeNull();
  });

  test("node under root but not in the segPaths table returns null", () => {
    const { segPaths } = projectVisibleText(html, []);
    const root = parse(html);
    // A text node added after the table was captured: still a descendant of
    // root, but its path was never recorded.
    const strayText = root.createTextNode("stray");
    // root.body is null for an xhtml-parsed XMLDocument (no HTMLDocument
    // shortcut); querySelector works for both parse modes.
    root.querySelector("body")!.appendChild(strayText);
    expect(segIndexForTextNode(root, segPaths, strayText)).toBeNull();
  });

  test("guards a degenerate node whose parent's childNodes is undefined (mirrors resolveNodeAtPath)", () => {
    const { segPaths } = projectVisibleText(html, []);
    const root = parse(html);
    const degenerateParent = {
      nodeType: 1,
      nodeName: "SPAN",
      childNodes: undefined,
      parentNode: root,
    } as unknown as Node;
    const orphanText = {
      nodeType: 3,
      nodeName: "#text",
      parentNode: degenerateParent,
    } as unknown as Node;
    expect(() => segIndexForTextNode(root, segPaths, orphanText)).not.toThrow();
    expect(segIndexForTextNode(root, segPaths, orphanText)).toBeNull();
  });
});

describe("epubSeqAtDomPoint", () => {
  // Two spines. Spine 0: token0 seg0[0,3), token1 seg0[4,7) (gap [3,4) between
  // them), token2 a multi-seg token startSeg1@8 -> endSeg2@3. Spine 1: token3
  // seg0[0,5), token4 seg0[6,10). Spine 2 carries no tokens at all.
  const tokens: EpubTokenColumns = {
    spineIndex: [0, 0, 0, 1, 1],
    startSeg: [0, 0, 1, 0, 0],
    startOffset: [0, 4, 8, 0, 6],
    endSeg: [0, 1, 2, 0, 0],
    endOffset: [3, 7, 3, 5, 10],
  };

  test("exact hit at a token's start", () => {
    expect(epubSeqAtDomPoint(tokens, 0, 0, 0)).toBe(0);
  });

  test("exact hit in a token's middle", () => {
    expect(epubSeqAtDomPoint(tokens, 0, 0, 5)).toBe(1);
  });

  test("point between two tokens resolves forward", () => {
    // offset 3 is past token0's end (3) but before token1's start (4).
    expect(epubSeqAtDomPoint(tokens, 0, 0, 3)).toBe(1);
  });

  test("point before the spine's first token resolves to the first token", () => {
    expect(epubSeqAtDomPoint(tokens, 0, 0, -1)).toBe(0);
  });

  test("point at or past the spine's last token returns null", () => {
    // token2 ends at (seg2, offset3); exactly that point is past it (exclusive end).
    expect(epubSeqAtDomPoint(tokens, 0, 2, 3)).toBeNull();
    expect(epubSeqAtDomPoint(tokens, 0, 5, 0)).toBeNull();
  });

  test("multi-seg token containment: point in either segment of the token resolves to it", () => {
    expect(epubSeqAtDomPoint(tokens, 0, 1, 9)).toBe(2); // in the first seg
    expect(epubSeqAtDomPoint(tokens, 0, 2, 1)).toBe(2); // in the second seg
  });

  test("empty spine returns null", () => {
    expect(epubSeqAtDomPoint(tokens, 2, 0, 0)).toBeNull();
  });

  test("first spine boundary: does not leak into the next spine", () => {
    expect(epubSeqAtDomPoint(tokens, 1, 0, 0)).toBe(3);
  });

  test("last spine boundary: last token of the last spine", () => {
    expect(epubSeqAtDomPoint(tokens, 1, 0, 8)).toBe(4);
    expect(epubSeqAtDomPoint(tokens, 1, 0, 10)).toBeNull();
  });
});

describe("vttSeqForEpubSeq", () => {
  function spanFixture(overrides: Partial<MatchSpan>): MatchSpan {
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

  const spans: MatchSpan[] = [
    spanFixture({ vttStart: 0, vttEnd: 3, epubStart: 10, epubEnd: 13 }),
    spanFixture({ vttStart: 5, vttEnd: 8, epubStart: 20, epubEnd: 23 }),
  ];

  test("inside a span resolves exactly", () => {
    expect(vttSeqForEpubSeq(spans, 11)).toEqual({ vttSeq: 1, exact: true });
  });

  test("at a span's start edge", () => {
    expect(vttSeqForEpubSeq(spans, 10)).toEqual({ vttSeq: 0, exact: true });
  });

  test("at a span's last valid offset (end is exclusive)", () => {
    expect(vttSeqForEpubSeq(spans, 12)).toEqual({ vttSeq: 2, exact: true });
  });

  test("in a gap between spans forward-snaps to the next span's first token", () => {
    expect(vttSeqForEpubSeq(spans, 15)).toEqual({ vttSeq: 5, exact: false });
  });

  test("in the leading gap before the first span forward-snaps to it", () => {
    expect(vttSeqForEpubSeq(spans, 2)).toEqual({ vttSeq: 0, exact: false });
  });

  test("past the last span returns null", () => {
    expect(vttSeqForEpubSeq(spans, 23)).toBeNull();
    expect(vttSeqForEpubSeq(spans, 100)).toBeNull();
  });

  test("no spans at all returns null", () => {
    expect(vttSeqForEpubSeq([], 0)).toBeNull();
  });

  test("round-trips with deriveEpubSeq: derive forward, invert back", () => {
    const vttTokenCount = 8;
    const epubSeq = deriveEpubSeq(spans, vttTokenCount);
    for (let vttSeq = 0; vttSeq < vttTokenCount; vttSeq++) {
      const forward = epubSeq[vttSeq]!;
      if (forward === -1) continue; // unmatched; not this helper's contract
      expect(vttSeqForEpubSeq(spans, forward)).toEqual({
        vttSeq,
        exact: true,
      });
    }
  });
});
