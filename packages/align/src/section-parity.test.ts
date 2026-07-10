import { describe, expect, test } from "bun:test";
import { checkSectionParity } from "./section-parity.ts";
import { parseContentDocument, projectVisibleText } from "./epub-extract.ts";

/**
 * Derive segPaths/segTextLen the honest way — via projectVisibleText, the
 * same server-side extraction section-parity.ts is meant to validate against
 * — rather than hand-building a fixture table that might not match real
 * extraction output.
 */
function captureTable(html: string): {
  segPaths: number[][];
  segTextLen: number[];
} {
  const { segPaths, segRanges } = projectVisibleText(html, []);
  return { segPaths, segTextLen: segRanges.map((r) => r.end - r.start) };
}

/** A fresh parse of the same HTML, standing in for the browser's independent
 * DOMParser pass over the same section bytes. */
function freshParse(html: string): Document {
  return parseContentDocument(html, "xml-first").document;
}

describe("checkSectionParity", () => {
  test("ok: a fresh parse of the same HTML matches the captured table", () => {
    const html =
      "<html><body><p>Alice was here</p><p>Second paragraph text</p></body></html>";
    const { segPaths, segTextLen } = captureTable(html);
    expect(segPaths.length).toBeGreaterThan(0);
    const result = checkSectionParity(freshParse(html), segPaths, segTextLen);
    expect(result).toEqual({ ok: true, segCount: segPaths.length });
  });

  test("empty table + empty section: ok, segCount 0", () => {
    const html = "<html><body></body></html>";
    const result = checkSectionParity(freshParse(html), [], []);
    expect(result).toEqual({ ok: true, segCount: 0 });
  });

  test("seg-table-mismatch: segPaths/segTextLen lengths disagree", () => {
    const html = "<html><body><p>Alice was here</p></body></html>";
    const { segPaths, segTextLen } = captureTable(html);
    const result = checkSectionParity(freshParse(html), segPaths, [
      ...segTextLen,
      99,
    ]);
    expect(result).toEqual({
      ok: false,
      reason: "seg-table-mismatch",
      expectedSegCount: segPaths.length,
    });
  });

  test("seg-path-failed: a removed text node fails at the right index with the DomPathNodeResult detail", () => {
    const html =
      "<html><body><p>Alice was here</p><p>Second paragraph text</p></body></html>";
    const { segPaths, segTextLen } = captureTable(html);
    const doc = freshParse(html);
    const firstParagraph = doc.getElementsByTagName("p")[0]!;
    firstParagraph.removeChild(firstParagraph.firstChild!);

    const result = checkSectionParity(doc, segPaths, segTextLen);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("seg-path-failed");
    expect(result.firstDivergentSeg).toBe(0);
    expect(result.detail).toMatchObject({ ok: false });
  });

  test("seg-length-mismatch: shorter edited text reports {expected, actual}", () => {
    const html = "<html><body><p>Alice was here</p></body></html>";
    const { segPaths, segTextLen } = captureTable(html);
    const doc = freshParse(html);
    const textNode = doc.getElementsByTagName("p")[0]!.firstChild!;
    textNode.nodeValue = "short";

    const result = checkSectionParity(doc, segPaths, segTextLen);
    expect(result).toEqual({
      ok: false,
      reason: "seg-length-mismatch",
      expectedSegCount: segPaths.length,
      firstDivergentSeg: 0,
      detail: { expected: segTextLen[0], actual: "short".length },
    });
  });

  test("seg-length-mismatch: longer edited text reports {expected, actual}", () => {
    const html = "<html><body><p>Alice was here</p></body></html>";
    const { segPaths, segTextLen } = captureTable(html);
    const doc = freshParse(html);
    const textNode = doc.getElementsByTagName("p")[0]!.firstChild!;
    textNode.nodeValue = "Alice was here, and much longer now";

    const result = checkSectionParity(doc, segPaths, segTextLen);
    expect(result).toEqual({
      ok: false,
      reason: "seg-length-mismatch",
      expectedSegCount: segPaths.length,
      firstDivergentSeg: 0,
      detail: {
        expected: segTextLen[0],
        actual: "Alice was here, and much longer now".length,
      },
    });
  });

  test("first-divergence-only: mutating two segments reports the first", () => {
    const html =
      "<html><body><p>first paragraph text</p><p>second paragraph text</p><p>third paragraph text</p></body></html>";
    const { segPaths, segTextLen } = captureTable(html);
    expect(segPaths.length).toBeGreaterThanOrEqual(3);
    const doc = freshParse(html);
    const paragraphs = doc.getElementsByTagName("p");
    // Mutate segments 0 and 1 — the report must name only the first (0), not 1.
    paragraphs[0]!.firstChild!.nodeValue = "mutated";
    paragraphs[1]!.firstChild!.nodeValue = "also mutated";

    const result = checkSectionParity(doc, segPaths, segTextLen);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("seg-length-mismatch");
    expect(result.firstDivergentSeg).toBe(0);
  });
});
