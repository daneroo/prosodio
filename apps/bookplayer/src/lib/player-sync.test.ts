import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { projectVisibleText } from "@prosodio/align";
import { prepareAlignment } from "./alignment-client.ts";
import { seekTargetForBookPoint } from "./player-sync.ts";
import type { AlignmentArtifact } from "@prosodio/align/browser";

/**
 * seekTargetForBookPoint (plan player-sync-core T2.3) composes T2.1's
 * package helpers (segIndexForTextNode/epubSeqAtDomPoint/vttSeqForEpubSeq),
 * already unit-tested at the boundary math level in
 * packages/align/src/epub-dom-point.test.ts. This file exercises the
 * composition + the route-facing error/snap contract, not the boundary math
 * itself — one small real DOM (via jsdom, same parse strategy epub-extract.ts
 * uses) and one small artifact fixture, reused across cases.
 *
 * Fixture text: "Hello world foo bar" (single text node, one segment) —
 * four EPUB tokens: "Hello"[0,5) "world"[6,11) "foo"[12,15) "bar"[16,19).
 * Only "world" and "foo" (epub seq 1..2) are matched, to vtt seq 0..1 (one
 * cue, 10s..12s — word timing collapses both tokens' start to 10s, the last
 * token's end to 12s, same collapse rule as alignment-client.test.ts).
 */
const SPINE_HTML = "<html><body>Hello world foo bar</body></html>";

function parseXhtml(html: string): Document {
  return new JSDOM(html, { contentType: "application/xhtml+xml" }).window
    .document;
}

/** The one text node in SPINE_HTML, reached the same way epub.js's
 * dblclick selection would hand it to us: html -> body -> text. */
function spineTextNode(doc: Document): Text {
  return doc.documentElement.firstChild!.firstChild as Text;
}

function fixtureArtifact(): AlignmentArtifact {
  const { segPaths, segRanges } = projectVisibleText(SPINE_HTML, []);
  const segTextLen = segRanges.map((range) => range.end - range.start);

  return {
    schemaVersion: 3,
    features: [],
    source: {
      root: "fixtures",
      base: "synthetic",
      vttTiming: "word",
      vttProvenance: null,
    },
    config: {
      normalizationPolicy: "strict-nfkc-v1",
      pass1NgramSize: 6,
      proofNgramSize: 4,
      extraction: {
        includeNonLinearSpineItems: true,
        excludedElements: ["head", "script", "style"],
        domParser: "jsdom",
        parseMode: "by-extension",
      },
    },
    match: {
      // epub 1..3 (exclusive) == "world","foo" -> vtt 0..2 (exclusive).
      // epub 0 ("Hello") and epub 3 ("bar") are both unmatched, on either
      // side of the span, for the two snap/refusal cases below.
      spans: [
        {
          passId: "p1",
          vttStart: 0,
          vttEnd: 2,
          epubStart: 1,
          epubEnd: 3,
          evidence: {
            kind: "exact-unique-ngram",
            ngramSize: 3,
            uniquenessScope: "global",
            anchors: 1,
            extendedLeft: 0,
            extendedRight: 0,
          },
        },
      ],
      gaps: [],
      metrics: {
        passes: [],
        vttTokens: 2,
        epubTokens: 4,
        vttMatchedTokens: 2,
        epubMatchedTokens: 2,
        vttCoverage: 1,
        epubCoverage: 0.5,
        spanCount: 1,
        gapCount: 0,
        gapVttTokens: { count: 0, min: 0, max: 0, mean: 0, median: 0 },
        gapEpubTokens: { count: 0, min: 0, max: 0, mean: 0, median: 0 },
        gapSeconds: { count: 0, min: 0, max: 0, mean: 0, median: 0 },
        spines: [],
        anchorDensity: [],
        anomalies: [],
        warnings: [],
      },
    },
    vtt: {
      cues: {
        startSec: [10],
        endSec: [12],
        text: ["foo bar"],
      },
      tokens: {
        cueIndex: [0, 0],
        charStart: [0, 4],
        charEnd: [3, 7],
      },
    },
    epub: {
      spines: [
        {
          // Deliberately a different (longer) href than the clicked
          // sectionHref below, to exercise the suffix-match rule the spine
          // resolution mirrors from EpubReader's `locate`.
          href: "OEBPS/chapter1.xhtml",
          parseMode: "xhtml",
          segPaths,
          segTextLen,
        },
      ],
      tokens: {
        spineIndex: [0, 0, 0, 0],
        startSeg: [0, 0, 0, 0],
        startOffset: [0, 6, 12, 16],
        endSeg: [0, 0, 0, 0],
        endOffset: [5, 11, 15, 19],
      },
    },
  };
}

describe("seekTargetForBookPoint", () => {
  test("happy path: exact hit on a matched token resolves via the suffix href rule", () => {
    const prepared = prepareAlignment(fixtureArtifact());
    const doc = parseXhtml(SPINE_HTML);
    const node = spineTextNode(doc);

    // "chapter1.xhtml" is a suffix of the spine's "OEBPS/chapter1.xhtml".
    const result = seekTargetForBookPoint(prepared, {
      sectionHref: "chapter1.xhtml",
      node,
      offset: 6, // start of "world" (epub seq 1, matched -> vtt seq 0)
    });

    expect(result).toEqual({ vttSeq: 0, timeSec: 10, exact: true });
  });

  test("unmatched word forward-snaps to the next matched token (exact: false)", () => {
    const prepared = prepareAlignment(fixtureArtifact());
    const doc = parseXhtml(SPINE_HTML);
    const node = spineTextNode(doc);

    // offset 0 = start of "Hello" (epub seq 0), unmatched — the span starts
    // at epub seq 1, so this snaps forward to the span's first vtt token.
    const result = seekTargetForBookPoint(prepared, {
      sectionHref: "OEBPS/chapter1.xhtml",
      node,
      offset: 0,
    });

    expect(result).toEqual({ vttSeq: 0, timeSec: 10, exact: false });
  });

  test("sectionHref matching no spine returns spine-not-found", () => {
    const prepared = prepareAlignment(fixtureArtifact());
    const doc = parseXhtml(SPINE_HTML);
    const node = spineTextNode(doc);

    const result = seekTargetForBookPoint(prepared, {
      sectionHref: "nonexistent.xhtml",
      node,
      offset: 0,
    });

    expect(result).toEqual({ error: "spine-not-found" });
  });

  test("a node whose DOM path isn't in the section's segPaths table returns node-not-located", () => {
    const prepared = prepareAlignment(fixtureArtifact());
    const doc = parseXhtml(SPINE_HTML);
    // A second text node under the same section, added after the segPaths
    // table was captured: a real descendant of the section document, but at
    // a path ([0,0,1], body's second child) the table never recorded.
    const body = doc.documentElement.firstChild!;
    const strayNode = doc.createTextNode("stray");
    body.appendChild(strayNode);

    const result = seekTargetForBookPoint(prepared, {
      sectionHref: "chapter1.xhtml",
      node: strayNode,
      offset: 0,
    });

    expect(result).toEqual({ error: "node-not-located" });
  });

  test("no-match-forward: click past the spine's last EPUB token (v1 does not cross into the next spine)", () => {
    const prepared = prepareAlignment(fixtureArtifact());
    const doc = parseXhtml(SPINE_HTML);
    const node = spineTextNode(doc);

    // offset 20 is past "bar"'s end (19) — nothing left in this spine.
    const result = seekTargetForBookPoint(prepared, {
      sectionHref: "chapter1.xhtml",
      node,
      offset: 20,
    });

    expect(result).toEqual({ error: "no-match-forward" });
  });

  test("no-match-forward: a valid EPUB token past the last matched span refuses rather than guessing backward", () => {
    const prepared = prepareAlignment(fixtureArtifact());
    const doc = parseXhtml(SPINE_HTML);
    const node = spineTextNode(doc);

    // offset 16 = start of "bar" (epub seq 3): a real token, but past the
    // span's epubEnd (3) — no matched span exists at or after it.
    const result = seekTargetForBookPoint(prepared, {
      sectionHref: "chapter1.xhtml",
      node,
      offset: 16,
    });

    expect(result).toEqual({ error: "no-match-forward" });
  });
});
