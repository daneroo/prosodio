import { describe, expect, test } from "bun:test";
import { config } from "./config.ts";
import { diagnoseRangeFromDomPath } from "./epub-dom-path.ts";
import {
  extractEpub,
  parseContentDocument,
  parserPreferenceForHref,
} from "./epub-extract.ts";
import { aliceEpubBytes } from "./fixture-paths.ts";
import { normalizeText } from "./normalize.ts";

/**
 * L1 capture self-check (design: "The DOM path", validation ladder L1). Proves
 * capture + resolver correctness WITHIN one parser: every token locator
 * captured by extractEpub resolves against a completely fresh jsdom re-parse
 * of its section, and the resolved range's normalized text equals the token's
 * norm. It does NOT prove jsdom<->browser parity across parsers — that is L2
 * (section-parity.ts, runtime) and L3 (the dev-gated locate-coverage sweep).
 *
 * Re-reads each included section's raw HTML by opening the same EPUB bytes a
 * second time through the same untyped epub-ts surface extractEpub uses
 * internally (Book + archive.getText + path.resolve). This mirrors
 * epub-extract.ts's own extraction loop rather than adding a test-only seam;
 * the jsdom DOMParser global is already installed by epub-extract.ts's module
 * load (imported above), so the dynamic Book import here sees it too.
 */
async function readSectionHtml(
  bytes: ArrayBuffer,
  hrefs: readonly string[],
): Promise<Map<string, string>> {
  const { Book } = await import("@likecoin/epub-ts/node");
  const book = new Book(bytes, { replacements: "none" });
  await book.opened;
  const bookAny = book as unknown as {
    archive?: { getText(url: string): Promise<string> | undefined };
    path?: { resolve(href: string): string };
  };
  const html = new Map<string, string>();
  for (const href of hrefs) {
    const archiveUrl = bookAny.path?.resolve(href) ?? "/" + href;
    const content = await bookAny.archive?.getText(archiveUrl);
    if (content != null) html.set(href, content);
  }
  book.destroy();
  return html;
}

describe("L1 capture self-check (Alice fixture)", async () => {
  const epubBytes = await aliceEpubBytes();
  const extraction = await extractEpub(epubBytes, config.extraction);
  const includedDocs = extraction.spineDocs.filter((doc) => doc.included);
  const htmlByHref = await readSectionHtml(
    epubBytes,
    includedDocs.map((doc) => doc.spineHref),
  );
  // One fresh parse per section (not per token) — reused by both tests below.
  const reparsed = includedDocs
    .map((doc) => {
      const html = htmlByHref.get(doc.spineHref);
      if (html == null) return null; // unreadable spine item; nothing to re-check
      return {
        doc,
        ...parseContentDocument(html, parserPreferenceForHref(doc.spineHref)),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  test("re-parse mode matches the captured parseMode for every included doc (parse-mode determinism)", () => {
    for (const { doc, mode } of reparsed) {
      expect(mode).toBe(doc.parseMode);
    }
  });

  test("every captured token locator resolves against a fresh re-parse and round-trips its normalized text", () => {
    interface Diagnostic {
      spineHref: string;
      tokenIndex: number;
      reason: string;
    }
    const failures: Diagnostic[] = [];
    let tokenCount = 0;

    for (const { doc, document } of reparsed) {
      doc.normalized.tokens.forEach((token, tokenIndex) => {
        tokenCount++;
        const locator = doc.dom.tokenLocators[tokenIndex];
        if (!locator) {
          failures.push({
            spineHref: doc.spineHref,
            tokenIndex,
            reason: "no captured locator for this token index",
          });
          return;
        }
        const diagnostic = diagnoseRangeFromDomPath(
          document,
          doc.dom.segPaths,
          locator,
        );
        if (!diagnostic.ok) {
          failures.push({
            spineHref: doc.spineHref,
            tokenIndex,
            reason: `resolve failed: ${JSON.stringify(diagnostic.failure)}`,
          });
          return;
        }
        const resolved = normalizeText(diagnostic.range.toString()).text;
        if (resolved !== token.norm) {
          failures.push({
            spineHref: doc.spineHref,
            tokenIndex,
            reason: `text mismatch: expected "${token.norm}", got "${resolved}"`,
          });
        }
      });
    }

    if (failures.length > 0) {
      const first5 = failures
        .slice(0, 5)
        .map((f) => JSON.stringify(f))
        .join("\n");
      throw new Error(
        `${failures.length} of ${tokenCount} L1 round-trip failures (first 5):\n${first5}`,
      );
    }

    console.log(
      `[L1] alice: ${tokenCount} tokens round-tripped across ${reparsed.length} spine docs`,
    );
  });
});
