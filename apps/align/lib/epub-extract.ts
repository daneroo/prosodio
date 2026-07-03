import { JSDOM } from "jsdom";
import type { EpubTextAddress } from "./contracts.ts";
import { normalizeText, type NormalizedText } from "./normalize.ts";

/**
 * EPUB text extraction: spine order (never TOC order), text in document
 * order, conservative structural exclusions only. Produces per-spine-document
 * normalized text + offset map via the shared normalizer, and the flat
 * whole-book token sequence the matcher consumes.
 *
 * UNRESOLVED PARSER DECISIONS — placeholder, not decided policy. Both change
 * extraction for EVERY book and must be evaluated before epoch4 close (BACKLOG
 * align-epub-parser-decisions; design "Open implementation decisions"):
 *   1. DOM engine: jsdom, always, in-process — bypasses epub-validate's proven
 *      LinkeDOM-first + jsdom-fallback hybrid (apps/epub-validate/src/
 *      epubts-node.ts); no subprocess hang guard.
 *   2. Parse mode: application/xhtml+xml first, text/html fallback (see
 *      parseContentDocument) — added to recover strict-XHTML books whose
 *      self-closing <title/> the HTML parser mishandles.
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
  parseMode: "text/html";
}

export interface SpineDocExtraction {
  spineIndex: number;
  spineHref: string;
  linear: boolean;
  /** false when excluded by the linear="no" configuration. */
  included: boolean;
  /** Document-order visible text — the raw side of the offset map. */
  visibleText: string;
  normalized: NormalizedText;
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
 * Parse an EPUB content document. EPUB content is XHTML by spec, so parse as
 * XML first: the HTML parser mishandles XHTML self-closing tags on raw-text
 * elements — `<title/>` opens a never-closed RCDATA element that swallows the
 * entire body, yielding zero visible text (real books do this). Fall back to
 * the lenient HTML parser for any document that is not well-formed XML.
 */
function parseContentDocument(html: string): Document {
  try {
    const doc = new JSDOM(html, { contentType: "application/xhtml+xml" }).window
      .document;
    if (doc.getElementsByTagName("parsererror").length === 0) return doc;
  } catch {
    // fall through to the lenient HTML parser
  }
  return new JSDOM(html, { contentType: "text/html" }).window.document;
}

/** Visible text of one content document, in document order. */
export function visibleTextFromHtml(
  html: string,
  excludedElements: readonly string[],
): string {
  const excluded = new Set(excludedElements.map((e) => e.toLowerCase()));
  const document = parseContentDocument(html);
  const parts: string[] = [];
  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        parts.push(child.nodeValue ?? "");
        continue;
      }
      if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
      const tag = (child as Element).tagName.toLowerCase();
      if (excluded.has(tag)) continue;
      const isBlock = BLOCK_ELEMENTS.has(tag);
      if (isBlock) parts.push("\n");
      walk(child);
      if (isBlock) parts.push("\n");
    }
  };
  walk(document);
  return parts.join("");
}

export async function extractEpub(
  epubPath: string,
  options: {
    includeNonLinearSpineItems: boolean;
    excludedElements: readonly string[];
  },
): Promise<EpubExtraction> {
  const config: ExtractionConfig = {
    includeNonLinearSpineItems: options.includeNonLinearSpineItems,
    excludedElements: options.excludedElements,
    domParser: "jsdom",
    parseMode: "text/html",
  };
  const warnings: string[] = [];

  const bytes = await Bun.file(epubPath).arrayBuffer();
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
    if (included) {
      const archiveUrl = bookAny.path?.resolve(spineHref) ?? "/" + spineHref;
      const content = await bookAny.archive?.getText(archiveUrl);
      if (content == null) {
        warnings.push(`unreadable spine item: ${spineHref}`);
      } else {
        visibleText = visibleTextFromHtml(content, options.excludedElements);
      }
    }
    spineDocs.push({
      spineIndex,
      spineHref,
      linear,
      included,
      visibleText,
      normalized: normalizeText(visibleText),
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
