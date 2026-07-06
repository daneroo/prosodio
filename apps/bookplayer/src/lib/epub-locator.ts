/**
 * Compact per-token EPUB locator index (plan thoughts/plans/bookplayer-align.md,
 * D7 / P2 proposal). One entry per flat EPUB token (index = epubSeq), built
 * server-side from the extraction's native DOM locators
 * (packages/align/src/epub-dom-path.ts) and shipped as base64 typed-array
 * columns — never a fat per-token JSON object (that was the badfix's 31 MB
 * mistake). The browser decodes lazily and resolves a token straight to a DOM
 * Range via `rangeFromDomPath` (@prosodio/align/browser); no re-normalization.
 */
import { decodeUint32, encodeUint32 } from "./typed-base64.ts";
import type { EpubExtraction } from "@prosodio/align";
import type { DomTokenLocator, SegPath } from "@prosodio/align/browser";

/**
 * `segPaths[spineIndex]` is that spine document's segment-path table (nested
 * JSON — segments number in the thousands, so this is small relative to the
 * per-token columns). The five per-token columns are base64 of little-endian
 * Uint32 arrays, one entry per epubSeq, length `tokenCount`.
 */
export interface EpubLocatorIndex {
  spineHrefs: Array<string>;
  excludedElements: Array<string>;
  segPaths: Array<Array<SegPath>>;
  spineIndexData: string;
  startSegData: string;
  startOffsetData: string;
  endSegData: string;
  endOffsetData: string;
  tokenCount: number;
}

/** Build the index from an extraction (server-side; the extraction carries
 * jsdom-derived dom locators but this function itself touches no jsdom). */
export function buildEpubLocatorIndex(
  extraction: EpubExtraction,
): EpubLocatorIndex {
  const tokenCount = extraction.tokens.length;
  const spineIndex = new Uint32Array(tokenCount);
  const startSeg = new Uint32Array(tokenCount);
  const startOffset = new Uint32Array(tokenCount);
  const endSeg = new Uint32Array(tokenCount);
  const endOffset = new Uint32Array(tokenCount);

  extraction.tokens.forEach((token, epubSeq) => {
    const doc = extraction.spineDocs[token.spineIndex];
    const locator = doc?.dom.tokenLocators[token.tokenIndex];
    if (!doc || !locator) {
      throw new Error(
        `missing dom locator for epub token ${epubSeq} (spine ${token.spineIndex}, tokenIndex ${token.tokenIndex})`,
      );
    }
    spineIndex[epubSeq] = token.spineIndex;
    startSeg[epubSeq] = locator.startSeg;
    startOffset[epubSeq] = locator.startOffset;
    endSeg[epubSeq] = locator.endSeg;
    endOffset[epubSeq] = locator.endOffset;
  });

  return {
    spineHrefs: extraction.spineDocs.map((doc) => doc.spineHref),
    excludedElements: [...extraction.config.excludedElements],
    segPaths: extraction.spineDocs.map((doc) => doc.dom.segPaths),
    spineIndexData: encodeUint32(spineIndex),
    startSegData: encodeUint32(startSeg),
    startOffsetData: encodeUint32(startOffset),
    endSegData: encodeUint32(endSeg),
    endOffsetData: encodeUint32(endOffset),
    tokenCount,
  };
}

interface DecodedColumns {
  spineIndex: Uint32Array;
  startSeg: Uint32Array;
  startOffset: Uint32Array;
  endSeg: Uint32Array;
  endOffset: Uint32Array;
}

const decodedIndexes = new WeakMap<EpubLocatorIndex, DecodedColumns>();

function decodedColumns(index: EpubLocatorIndex): DecodedColumns {
  const cached = decodedIndexes.get(index);
  if (cached) return cached;
  const decoded: DecodedColumns = {
    spineIndex: decodeUint32(index.spineIndexData),
    startSeg: decodeUint32(index.startSegData),
    startOffset: decodeUint32(index.startOffsetData),
    endSeg: decodeUint32(index.endSegData),
    endOffset: decodeUint32(index.endOffsetData),
  };
  decodedIndexes.set(index, decoded);
  return decoded;
}

export interface EpubTokenLocator {
  spineHref: string;
  segPaths: Array<SegPath>;
  loc: DomTokenLocator;
}

/** Constant-time decode of one token's locator. Bounds-checked; null on any
 * out-of-range epubSeq or a spine index the index doesn't know about. */
export function epubTokenLocator(
  index: EpubLocatorIndex,
  epubSeq: number,
): EpubTokenLocator | null {
  if (
    !Number.isInteger(epubSeq) ||
    epubSeq < 0 ||
    epubSeq >= index.tokenCount
  ) {
    return null;
  }
  const columns = decodedColumns(index);
  const spineIndex = columns.spineIndex[epubSeq];
  if (spineIndex === undefined) return null;
  const spineHref = index.spineHrefs[spineIndex];
  const segPaths = index.segPaths[spineIndex];
  if (spineHref === undefined || segPaths === undefined) return null;
  const startSeg = columns.startSeg[epubSeq];
  const startOffset = columns.startOffset[epubSeq];
  const endSeg = columns.endSeg[epubSeq];
  const endOffset = columns.endOffset[epubSeq];
  if (
    startSeg === undefined ||
    startOffset === undefined ||
    endSeg === undefined ||
    endOffset === undefined
  ) {
    return null;
  }
  return {
    spineHref,
    segPaths,
    loc: { startSeg, startOffset, endSeg, endOffset },
  };
}
