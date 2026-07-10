import { JSDOM } from "jsdom";
import type { EpubTextAddress } from "./contracts.ts";
import type { DomTokenLocator, SegPath } from "./epub-dom-path.ts";
import { normalizeText, type NormalizedText } from "./normalize.ts";

/**
 * EPUB text extraction: spine order (never TOC order), text in document
 * order, conservative structural exclusions only. Produces per-spine-document
 * normalized text + offset map via the shared normalizer, and the flat
 * whole-book token sequence the matcher consumes.
 *
 * UNRESOLVED PARSER DECISION — placeholder, not decided policy. Changes
 * extraction for EVERY book and must be evaluated before epoch4 close (BACKLOG
 * align-epub-parser-decisions; design "Open implementation decisions"):
 *   1. DOM engine: jsdom, always, in-process — bypasses epub-validate's proven
 *      LinkeDOM-first + jsdom-fallback hybrid (apps/epub-validate/src/
 *      epubts-node.ts); no subprocess hang guard.
 * Parse mode is RESOLVED (plan bookplayer-locate-hardening, decision H1):
 * extension-driven, mirroring epub.js — see parserPreferenceForHref and
 * parseContentDocument below.
 * epub.ts parses through the global DOMParser, so jsdom's is installed before
 * the node build is imported.
 */

(globalThis as { DOMParser?: unknown }).DOMParser ??= new JSDOM(
  "",
).window.DOMParser;
const { Book } = await import("@likecoin/epub-ts/node");

/** Extraction configuration echoed into every result for reproducibility. */
export interface ExtractionConfig {
  includeNonLinearSpineItems: boolean;
  excludedElements: readonly string[];
  domParser: "jsdom";
  parseMode: "by-extension";
}

/**
 * Which parser actually produced a spine document's tree (design D10,
 * resolved by corpus evidence — plan bookplayer-locate-hardening, decision
 * H1/H2; BACKLOG align-epub-parser-decisions). The parser is chosen BY
 * EXTENSION (parserPreferenceForHref), mirroring epub.js's own per-extension
 * choice (archive.js), so the server-captured tree matches what the browser
 * will build:
 *  - "xhtml": XML parse succeeded for a `.xhtml`/`.xht` (or other non-`.html`
 *    extension) section — matches what epub.js will do (parity-clean,
 *    expected).
 *  - "html": extension-selected HTML parse for a `.html`/`.htm` section —
 *    ALSO matches what epub.js will do, even when the content is well-formed
 *    XHTML (parity-clean, expected) — matching the browser matters more than
 *    parser purity.
 *  - "html-fallback": the extension preferred XML-first but the content was
 *    not well-formed XML, so the lenient HTML parser recovered it —
 *    predicted parity RISK: epub.js's own DOMParser will hit the same
 *    malformed content and get an XML parsererror tree for that section.
 */
export type ParseMode = "xhtml" | "html" | "html-fallback";

export interface SpineDocExtraction {
  spineIndex: number;
  spineHref: string;
  linear: boolean;
  /** false when excluded by the linear="no" configuration. */
  included: boolean;
  /** Document-order visible text — the raw side of the offset map. */
  visibleText: string;
  normalized: NormalizedText;
  /** "xhtml" by convention for excluded/empty docs — they have no content. */
  parseMode: ParseMode;
  /**
   * Native DOM index captured in the same traversal as visibleText, for
   * resolving a token straight to a DOM Range without re-normalizing text.
   * `tokenLocators` is parallel to `normalized.tokens`; `segTextLen` is
   * parallel to `segPaths` (UTF-16 length per text segment).
   */
  dom: {
    segPaths: SegPath[];
    segTextLen: number[];
    tokenLocators: DomTokenLocator[];
  };
}

export interface EpubToken {
  norm: string;
  /** Offset in the whole-book flat token sequence. */
  seq: number;
  spineIndex: number;
  /** Index into the spine doc's normalized.tokens (address resolution). */
  tokenIndex: number;
}

export interface EpubExtraction {
  spineDocs: SpineDocExtraction[];
  /** Flat sequence in spine order, included documents only. */
  tokens: EpubToken[];
  config: ExtractionConfig;
  warnings: string[];
}

/**
 * Block-level boundaries for visible-text assembly. Crossing one inserts a
 * newline so adjacent blocks never merge into one word; inline elements
 * insert nothing so `<i>Wo</i>rd` stays one word. The separator is a
 * normalizer boundary either way, so the normalized stream is unaffected by
 * intra-block whitespace details.
 */
const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "caption",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

/**
 * Which parser epub.js itself will use for a spine href, purely by file
 * extension (mirrors epub.js's archive.js): `.xhtml`/`.xht` (case-
 * insensitive) prefer XML-first; `.html`/`.htm` go straight to the HTML
 * parser; any other extension (rare) stays content-driven (XML-first). One
 * definition, exported, so extraction and the dev locate-sweep agree on the
 * policy.
 */
export function parserPreferenceForHref(href: string): "xml-first" | "html" {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(href);
  const ext = match?.[1]?.toLowerCase();
  return ext === "html" || ext === "htm" ? "html" : "xml-first";
}

/**
 * Parse an EPUB content document per the extension-driven policy (design
 * D10, resolved — plan bookplayer-locate-hardening, decision H1): `prefer`
 * is normally `parserPreferenceForHref(spineHref)`, so the tree captured
 * here matches what epub.js's own per-extension parser choice will build in
 * the browser.
 *  - prefer "html" (a `.html`/`.htm` spine href): parse straight as
 *    text/html, mode "html" — even when the content is well-formed XHTML;
 *    matching the browser matters more than parser purity.
 *  - prefer "xml-first" (`.xhtml`/`.xht` or any other extension): parse as
 *    XML first — EPUB content is XHTML by spec, and the HTML parser
 *    mishandles XHTML self-closing tags on raw-text elements (`<title/>`
 *    opens a never-closed RCDATA element that swallows the entire body).
 *    Fall back to the lenient HTML parser (mode "html-fallback") for any
 *    document that is not well-formed XML.
 * Exported (T1.5) so the L1 capture self-check can re-parse the same section
 * HTML the same way, outside this module's own extraction pass.
 */
export function parseContentDocument(
  html: string,
  prefer: "xml-first" | "html",
): {
  document: Document;
  mode: ParseMode;
} {
  if (prefer === "html") {
    return {
      document: new JSDOM(html, { contentType: "text/html" }).window.document,
      mode: "html",
    };
  }
  try {
    const doc = new JSDOM(html, { contentType: "application/xhtml+xml" }).window
      .document;
    if (doc.getElementsByTagName("parsererror").length === 0) {
      return { document: doc, mode: "xhtml" };
    }
  } catch {
    // fall through to the lenient HTML parser
  }
  return {
    document: new JSDOM(html, { contentType: "text/html" }).window.document,
    mode: "html-fallback",
  };
}

/**
 * Project a content document's visible text AND, in the same walk, the DOM
 * index needed to resolve any offset in that text back to a Text node: a
 * segment per non-empty Text node encountered, in document order, recording
 * its `[start, end)` range in the projected text and its childNodes index
 * path from the document root. Segments are emitted in text order, so their
 * ranges are sorted and non-overlapping (binary-searchable).
 */
export function projectVisibleText(
  html: string,
  excludedElements: readonly string[],
  prefer: "xml-first" | "html" = "xml-first",
): {
  text: string;
  segPaths: Array<SegPath>;
  segRanges: Array<{ start: number; end: number }>;
  parseMode: ParseMode;
} {
  const excluded = new Set(excludedElements.map((e) => e.toLowerCase()));
  const { document, mode: parseMode } = parseContentDocument(html, prefer);
  const parts: string[] = [];
  const segPaths: Array<SegPath> = [];
  const segRanges: Array<{ start: number; end: number }> = [];
  let length = 0;
  const path: number[] = [];

  const walk = (node: Node): void => {
    node.childNodes.forEach((child, index) => {
      path.push(index);
      if (child.nodeType === 3 /* TEXT_NODE */) {
        const text = child.nodeValue ?? "";
        if (text.length > 0) {
          segRanges.push({ start: length, end: length + text.length });
          segPaths.push([...path]);
        }
        parts.push(text);
        length += text.length;
        path.pop();
        return;
      }
      if (child.nodeType !== 1 /* ELEMENT_NODE */) {
        path.pop();
        return;
      }
      const tag = (child as Element).tagName.toLowerCase();
      if (excluded.has(tag)) {
        path.pop();
        return;
      }
      const isBlock = BLOCK_ELEMENTS.has(tag);
      if (isBlock) {
        parts.push("\n");
        length += 1;
      }
      walk(child);
      if (isBlock) {
        parts.push("\n");
        length += 1;
      }
      path.pop();
    });
  };
  walk(document);
  return { text: parts.join(""), segPaths, segRanges, parseMode };
}

/** Visible text of one content document, in document order. */
export function visibleTextFromHtml(
  html: string,
  excludedElements: readonly string[],
): string {
  return projectVisibleText(html, excludedElements).text;
}

/** Binary search for the segment whose `[start, end)` contains `offset`. */
function segmentIndexAt(
  segRanges: ReadonlyArray<{ start: number; end: number }>,
  offset: number,
): number {
  let low = 0;
  let high = segRanges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = segRanges[mid]!;
    if (offset < range.start) high = mid - 1;
    else if (offset >= range.end) low = mid + 1;
    else return mid;
  }
  throw new Error(`no text segment contains offset ${offset}`);
}

/**
 * Map a normalized token's raw `[rawStart, rawEnd)` range (UTF-16 offsets
 * into the projected text) to a DOM locator. Tokens never cross a block "\n"
 * separator (normalize.ts treats it as a boundary), but CAN span adjacent
 * inline Text nodes, so start and end are resolved to segments independently.
 */
function tokenLocatorFor(
  segRanges: ReadonlyArray<{ start: number; end: number }>,
  rawStart: number,
  rawEnd: number,
): DomTokenLocator {
  const startSeg = segmentIndexAt(segRanges, rawStart);
  const endSeg = segmentIndexAt(segRanges, rawEnd - 1);
  return {
    startSeg,
    startOffset: rawStart - segRanges[startSeg]!.start,
    endSeg,
    endOffset: rawEnd - segRanges[endSeg]!.start,
  };
}

/**
 * Extract spine text from EPUB bytes. Takes the EPUB file's raw bytes rather
 * than a filesystem path so the engine stays IO-free (callers own reading the
 * file, which keeps this runnable in a browser).
 */
export async function extractEpub(
  bytes: ArrayBuffer,
  options: {
    includeNonLinearSpineItems: boolean;
    excludedElements: readonly string[];
  },
): Promise<EpubExtraction> {
  const config: ExtractionConfig = {
    includeNonLinearSpineItems: options.includeNonLinearSpineItems,
    excludedElements: options.excludedElements,
    domParser: "jsdom",
    parseMode: "by-extension",
  };
  const warnings: string[] = [];

  const book = new Book(bytes, { replacements: "none" });
  await book.opened;
  // Same untyped surface epub-validate's worker documents: spine idrefs join
  // to manifest hrefs; path.resolve normalizes to the archive entry.
  const bookAny = book as unknown as {
    packaging?: {
      spine?: Array<{ idref: string; linear: string }>;
      manifest?: Record<string, { href: string }>;
    };
    archive?: { getText(url: string): Promise<string> | undefined };
    path?: { resolve(href: string): string };
  };

  const spineDocs: SpineDocExtraction[] = [];
  const spineItems = bookAny.packaging?.spine ?? [];
  for (const [spineIndex, item] of spineItems.entries()) {
    const spineHref =
      bookAny.packaging?.manifest?.[item.idref]?.href ?? item.idref;
    const linear = item.linear !== "no";
    const included = linear || options.includeNonLinearSpineItems;
    let visibleText = "";
    let dom: SpineDocExtraction["dom"] = {
      segPaths: [],
      segTextLen: [],
      tokenLocators: [],
    };
    // Excluded/empty docs have no content, so no parser ever ran on them —
    // "xhtml" by convention (see SpineDocExtraction doc comment).
    let parseMode: ParseMode = "xhtml";
    let normalized = normalizeText(visibleText);
    if (included) {
      const archiveUrl = bookAny.path?.resolve(spineHref) ?? "/" + spineHref;
      const content = await bookAny.archive?.getText(archiveUrl);
      if (content == null) {
        warnings.push(`unreadable spine item: ${spineHref}`);
      } else {
        const projection = projectVisibleText(
          content,
          options.excludedElements,
          parserPreferenceForHref(spineHref),
        );
        visibleText = projection.text;
        parseMode = projection.parseMode;
        normalized = normalizeText(visibleText);
        dom = {
          segPaths: projection.segPaths,
          segTextLen: projection.segRanges.map((r) => r.end - r.start),
          tokenLocators: normalized.tokens.map((token) =>
            tokenLocatorFor(projection.segRanges, token.rawStart, token.rawEnd),
          ),
        };
      }
    }
    spineDocs.push({
      spineIndex,
      spineHref,
      linear,
      included,
      visibleText,
      normalized,
      parseMode,
      dom,
    });
  }
  book.destroy();

  const tokens: EpubToken[] = [];
  for (const doc of spineDocs) {
    if (!doc.included) continue;
    doc.normalized.tokens.forEach((token, tokenIndex) => {
      tokens.push({
        norm: token.norm,
        seq: tokens.length,
        spineIndex: doc.spineIndex,
        tokenIndex,
      });
    });
  }

  return { spineDocs, tokens, config, warnings };
}

/**
 * Resolve a half-open flat-token range to addresses in normalized-text space.
 * One address per spine document touched — a span that crosses a document
 * boundary yields several.
 */
export function resolveAddresses(
  extraction: EpubExtraction,
  startSeq: number,
  endSeq: number,
): EpubTextAddress[] {
  const addresses: EpubTextAddress[] = [];
  for (let seq = startSeq; seq < endSeq; seq++) {
    const token = extraction.tokens[seq];
    if (!token) throw new Error(`token seq ${seq} out of bounds`);
    const doc = extraction.spineDocs[token.spineIndex]!;
    const range = doc.normalized.tokens[token.tokenIndex]!;
    const last = addresses.at(-1);
    if (last && last.spineIndex === token.spineIndex) {
      last.end = range.end;
    } else {
      addresses.push({
        spineIndex: doc.spineIndex,
        spineHref: doc.spineHref,
        start: range.start,
        end: range.end,
      });
    }
  }
  return addresses;
}
