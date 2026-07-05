import { describe, expect, test } from "bun:test";
import { config } from "./config.ts";
import {
  extractEpub,
  resolveAddresses,
  visibleTextFromHtml,
} from "./epub-extract.ts";
import { fixturePaths } from "./fixture-paths.ts";
import { normalizeText } from "./normalize.ts";

const EXCLUDED = config.extraction.excludedElements;

describe("visibleTextFromHtml", () => {
  test("excludes head, script, and style content", () => {
    const html = `<html><head><title>Secret Title</title><style>p{color:red}</style></head>
      <body><p>Visible words.</p><script>var hidden = 1;</script></body></html>`;
    const text = visibleTextFromHtml(html, EXCLUDED);
    expect(normalizeText(text).text).toBe("visible words");
  });

  test("inline elements do not split words; block elements do separate them", () => {
    const html = `<body><p>Wo<i>rd</i> stays</p><p>next</p><div>block</div></body>`;
    const tokens = normalizeText(visibleTextFromHtml(html, EXCLUDED)).tokens;
    expect(tokens.map((t) => t.norm)).toEqual([
      "word",
      "stays",
      "next",
      "block",
    ]);
  });

  test("adjacent minified blocks never merge into one word", () => {
    const html = `<body><p>end.</p><p>Start</p></body>`;
    expect(
      normalizeText(visibleTextFromHtml(html, EXCLUDED)).tokens.map(
        (t) => t.norm,
      ),
    ).toEqual(["end", "start"]);
  });

  test("XHTML self-closing tags do not swallow the body (regression)", () => {
    // Real EPUBs use XHTML: <title/> is well-formed XML but, parsed as HTML,
    // opens a never-closed RCDATA <title> that eats the whole document.
    const xhtml = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title/><meta charset="utf-8"/></head><body><h1>Chapter 1</h1><p>The island of Gont.</p></body></html>`;
    expect(normalizeText(visibleTextFromHtml(xhtml, EXCLUDED)).text).toBe(
      "chapter 1 the island of gont",
    );
  });

  test("malformed (non-XML) HTML still extracts via the fallback parser", () => {
    // Unclosed <p> and a bare & are not well-formed XML; the HTML parser must
    // still recover the text.
    const html = `<body><p>Tom & Jerry<p>next paragraph</body>`;
    expect(normalizeText(visibleTextFromHtml(html, EXCLUDED)).text).toBe(
      "tom jerry next paragraph",
    );
  });
});

describe("extractEpub on the committed Alice EPUB", async () => {
  const extraction = await extractEpub(
    fixturePaths.aliceEpub,
    config.extraction,
  );

  test("walks spine documents in spine order with recorded config", () => {
    expect(extraction.spineDocs.length).toBeGreaterThan(0);
    expect(extraction.spineDocs.map((d) => d.spineIndex)).toEqual([
      ...extraction.spineDocs.keys(),
    ]);
    for (const doc of extraction.spineDocs) {
      expect(doc.spineHref.length).toBeGreaterThan(0);
    }
    expect(extraction.config).toEqual({
      includeNonLinearSpineItems: true,
      excludedElements: EXCLUDED,
      domParser: "jsdom",
      parseMode: "text/html",
    });
    expect(extraction.warnings).toEqual([]);
  });

  test("the flat token sequence contains the book's opening sentence", () => {
    const norm = extraction.tokens.map((t) => t.norm).join(" ");
    expect(norm).toContain(
      "alice was beginning to get very tired of sitting by her sister",
    );
    expect(norm).toContain("down the rabbit hole");
    // The committed Alice is the illustrated Gutenberg #19033 retelling —
    // shorter than the #11 text the LibriVox narration reads (~13.3k tokens:
    // two content docs plus ~29 one-token image-wrap docs).
    expect(extraction.tokens.length).toBeGreaterThan(13_000);
  });

  test("flat seq offsets are contiguous and addresses resolve to their tokens", () => {
    extraction.tokens.forEach((token, i) => {
      expect(token.seq).toBe(i);
    });
    const mid = Math.floor(extraction.tokens.length / 2);
    const [address] = resolveAddresses(extraction, mid, mid + 1);
    const doc = extraction.spineDocs[address!.spineIndex]!;
    expect(doc.normalized.text.slice(address!.start, address!.end)).toBe(
      extraction.tokens[mid]!.norm,
    );
  });

  test("a multi-token range yields one address per spine document touched", () => {
    const addresses = resolveAddresses(extraction, 0, 50);
    expect(addresses.length).toBeGreaterThanOrEqual(1);
    for (const address of addresses) {
      expect(address.end).toBeGreaterThan(address.start);
    }
  });

  test("extraction is deterministic", async () => {
    const again = await extractEpub(fixturePaths.aliceEpub, config.extraction);
    expect(again).toEqual(extraction);
  });
});
