import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import { normalizeText, rangeFromDomPath } from "@prosodio/align/browser";
import { buildEpubLocatorIndex, epubTokenLocator } from "./epub-locator.ts";
import { projectVisibleText } from "@prosodio/align";
import type { EpubExtraction } from "@prosodio/align";

/**
 * Build a minimal, extraction-shaped EpubExtraction for one spine document,
 * using the engine's own DOM projection (packages/align/src/epub-extract.ts
 * logic) so the locator index this test builds is representative of what
 * `extractEpub` produces.
 */
function syntheticExtraction(html: string): EpubExtraction {
  const excludedElements: Array<string> = [];
  const projection = projectVisibleText(html, excludedElements);
  const normalized = normalizeText(projection.text);

  const tokenLocators = normalized.tokens.map((token) => {
    const startSeg = projection.segRanges.findIndex(
      (r) => token.rawStart >= r.start && token.rawStart < r.end,
    );
    const endSeg = projection.segRanges.findIndex(
      (r) => token.rawEnd - 1 >= r.start && token.rawEnd - 1 < r.end,
    );
    return {
      startSeg,
      startOffset: token.rawStart - projection.segRanges[startSeg]!.start,
      endSeg,
      endOffset: token.rawEnd - projection.segRanges[endSeg]!.start,
    };
  });

  const extraction: EpubExtraction = {
    spineDocs: [
      {
        spineIndex: 0,
        spineHref: "text/chapter1.xhtml",
        linear: true,
        included: true,
        visibleText: projection.text,
        normalized,
        dom: { segPaths: projection.segPaths, tokenLocators },
      },
    ],
    tokens: normalized.tokens.map((token, tokenIndex) => ({
      norm: token.norm,
      seq: tokenIndex,
      spineIndex: 0,
      tokenIndex,
    })),
    config: {
      includeNonLinearSpineItems: false,
      excludedElements,
      domParser: "jsdom",
      parseMode: "text/html",
    },
    warnings: [],
  };
  return extraction;
}

describe("buildEpubLocatorIndex + epubTokenLocator", () => {
  // Well-formed XHTML, as real EPUB content documents are: parsed as XML by
  // both the extraction (parseContentDocument's XML-first path) and the
  // "browser" stand-in below, so the two DOMs are structurally identical
  // (no auto-inserted <head>, which a lenient HTML parse would add).
  const html =
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Down the <em>rabbit</em>-hole they went.</p></body></html>';
  const extraction = syntheticExtraction(html);

  test("round-trips every token to its expected raw text via rangeFromDomPath", () => {
    const index = buildEpubLocatorIndex(extraction);
    expect(index.tokenCount).toBe(extraction.tokens.length);

    // A fresh, independently-parsed document — standing in for the browser's
    // own parse of the same section (parser-parity assumption under test).
    const doc = new JSDOM(html, { contentType: "application/xhtml+xml" }).window
      .document;

    extraction.tokens.forEach((token, epubSeq) => {
      const locator = epubTokenLocator(index, epubSeq);
      expect(locator).not.toBeNull();
      expect(locator!.spineHref).toBe("text/chapter1.xhtml");

      const range = rangeFromDomPath(doc, locator!.segPaths, locator!.loc);
      expect(range).not.toBeNull();

      const spineDoc = extraction.spineDocs[token.spineIndex]!;
      const expectedRaw = spineDoc.normalized.tokens[token.tokenIndex]!.raw;
      expect(normalizeText(range!.toString()).text).toBe(
        normalizeText(expectedRaw).text,
      );
    });
  });

  test("epubTokenLocator bounds-checks epubSeq", () => {
    const index = buildEpubLocatorIndex(extraction);
    expect(epubTokenLocator(index, -1)).toBeNull();
    expect(epubTokenLocator(index, index.tokenCount)).toBeNull();
    expect(epubTokenLocator(index, 1.5)).toBeNull();
  });
});
