import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { rangeFromDomPath } from "./epub-dom-path.ts";
import { projectVisibleText } from "./epub-extract.ts";
import { normalizeText } from "./normalize.ts";

/**
 * Parse HTML the same way epub-extract's parseContentDocument does
 * (application/xhtml+xml first, text/html fallback) so childNodes paths
 * captured by projectVisibleText line up with the DOM we resolve against —
 * plain text/html parsing auto-inserts an empty <head>, shifting indices. A
 * separate JSDOM instance per call mimics resolving against a freshly-parsed
 * section document in the browser, distinct from whatever DOM extraction
 * happened to walk.
 */
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

describe("rangeFromDomPath round-trip", () => {
  test("resolves a simple token to its Text node range", () => {
    const html = "<html><body><p>Alice was here</p></body></html>";
    const { text, segPaths, segRanges } = projectVisibleText(html, []);
    const normalized = normalizeText(text);
    const token = normalized.tokens.find((t) => t.norm === "was")!;
    const locator = {
      startSeg: 0,
      startOffset: token.rawStart - segRanges[0]!.start,
      endSeg: 0,
      endOffset: token.rawEnd - segRanges[0]!.start,
    };

    const freshDoc = parse(html);
    const range = rangeFromDomPath(freshDoc, segPaths, locator);
    expect(range?.toString()).toBe("was");
  });

  test("inline split: token spans two adjacent Text nodes (startSeg !== endSeg)", () => {
    const html = "<html><body><p><em>hel</em>lo world</p></body></html>";
    const { text, segPaths, segRanges } = projectVisibleText(html, []);
    const normalized = normalizeText(text);
    const token = normalized.tokens.find((t) => t.norm === "hello")!;

    const startSeg = segRanges.findIndex(
      (r) => token.rawStart >= r.start && token.rawStart < r.end,
    );
    const endSeg = segRanges.findIndex(
      (r) => token.rawEnd - 1 >= r.start && token.rawEnd - 1 < r.end,
    );
    expect(startSeg).not.toBe(endSeg);

    const locator = {
      startSeg,
      startOffset: token.rawStart - segRanges[startSeg]!.start,
      endSeg,
      endOffset: token.rawEnd - segRanges[endSeg]!.start,
    };

    const freshDoc = parse(html);
    const range = rangeFromDomPath(freshDoc, segPaths, locator);
    expect(range?.toString()).toBe("hello");
  });

  test("block boundary: synthetic newline between blocks does not shift offsets", () => {
    const html =
      "<html><body><p>first block</p><p>second block</p></body></html>";
    const { text, segPaths, segRanges } = projectVisibleText(html, []);
    const normalized = normalizeText(text);
    const token = normalized.tokens.find((t) => t.norm === "second")!;

    const seg = segRanges.findIndex(
      (r) => token.rawStart >= r.start && token.rawStart < r.end,
    );
    const locator = {
      startSeg: seg,
      startOffset: token.rawStart - segRanges[seg]!.start,
      endSeg: seg,
      endOffset: token.rawEnd - segRanges[seg]!.start,
    };

    const freshDoc = parse(html);
    const range = rangeFromDomPath(freshDoc, segPaths, locator);
    expect(range?.toString()).toBe("second");
  });

  test("returns null for a path that no longer resolves to a Text node", () => {
    const html = "<html><body><p>Alice was here</p></body></html>";
    const { segPaths } = projectVisibleText(html, []);
    const freshDoc = parse("<html><body></body></html>");
    const range = rangeFromDomPath(freshDoc, segPaths, {
      startSeg: 0,
      startOffset: 0,
      endSeg: 0,
      endOffset: 3,
    });
    expect(range).toBeNull();
  });
});
