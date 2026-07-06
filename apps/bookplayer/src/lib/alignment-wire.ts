/**
 * Browser-safe wire types + codecs for the AlignmentViewer (plan
 * thoughts/plans/bookplayer-align.md). Split out of alignment.ts so the
 * client bundle never pulls in that module's node:fs/node:path/media.ts
 * imports — a VALUE import (unlike a type-only import) is not erased and
 * would otherwise drag the server module into the client graph.
 */
import {
  decodeFloat32,
  decodeInt32,
  decodeUint32,
  encodeFloat32,
  encodeInt32,
  encodeUint32,
} from "./typed-base64.ts";
import type { EpubLocatorIndex } from "./epub-locator.ts";

/**
 * One normalized VTT token, carrying its own interpolated time interval so
 * playback highlights the active WORD, not the whole cue (plan D7, P1).
 * `matched` = covered by an accepted alignment span; `epubSeq` is the token's
 * position in the flat EPUB token sequence when matched, else null.
 */
export interface AlignedToken {
  raw: string;
  startSec: number;
  endSec: number;
  matched: boolean;
  epubSeq: number | null;
}

export interface AlignedCue {
  startSec: number;
  endSec: number;
  /** Tokens in order; the cue is a presentation group, tokens are the unit. */
  tokens: Array<AlignedToken>;
  /** Matched words / words, 0..1. */
  matchedRatio: number;
  /** EPUB tokens never narrated, in the residual gap following this cue. */
  gapEpubTokens: number;
}

export interface AlignmentSummary {
  vttCoverage: number;
  epubCoverage: number;
  spanCount: number;
  gapCount: number;
  timing: "word" | "interpolated";
  /** EPUB tokens in a residual gap before the first narrated word. */
  leadingGapEpubTokens: number;
}

/**
 * Wire-compact form of the per-cue token table (Phase 7c): the fat per-token
 * JSON in `AlignedCue.tokens` (2.67 MB on Alice in Wonderland, ~13 MB
 * extrapolated for a full novel) becomes columnar base64 typed arrays, all
 * tokens across all cues flattened in cue order. Decoded back into
 * `AlignedCue[]` client-side (`decodeAlignedCues`) so no UI logic changes.
 */
export interface CompactTokenTable {
  count: number;
  /** b64 Float32, one entry per token. */
  startSec: string;
  /** b64 Float32, one entry per token. */
  endSec: string;
  /** b64 Int32, one entry per token; -1 = unmatched. */
  epubSeq: string;
  /** Every token's `raw` string, concatenated in flat-table order. */
  rawText: string;
  /** b64 Uint32, one entry per token: `raw`'s UTF-16 code-unit length, so
   * `rawText` can be sliced back into per-token pieces. */
  rawLengths: string;
}

export interface CompactCue {
  startSec: number;
  endSec: number;
  /** Index into the flat token table where this cue's tokens start. */
  tokenStart: number;
  tokenCount: number;
  matchedRatio: number;
  gapEpubTokens: number;
}

export type AlignmentPayload =
  | { status: "unavailable" }
  | {
      status: "ready";
      summary: AlignmentSummary;
      cues: Array<CompactCue>;
      tokens: CompactTokenTable;
      epub: EpubLocatorIndex;
    };

/** Flatten every cue's tokens (in cue order) into columnar typed-array
 * base64 strings — the server side of the Phase 7c wire compaction. */
export function encodeAlignedCues(cues: Array<AlignedCue>): {
  cues: Array<CompactCue>;
  tokens: CompactTokenTable;
} {
  const flatTokens = cues.flatMap((cue) => cue.tokens);
  const count = flatTokens.length;
  const startSec = new Float32Array(count);
  const endSec = new Float32Array(count);
  const epubSeq = new Int32Array(count);
  const rawLengths = new Uint32Array(count);
  let rawText = "";
  flatTokens.forEach((token, i) => {
    startSec[i] = token.startSec;
    endSec[i] = token.endSec;
    epubSeq[i] = token.epubSeq ?? -1;
    rawLengths[i] = token.raw.length;
    rawText += token.raw;
  });

  let tokenStart = 0;
  const compactCues = cues.map((cue): CompactCue => {
    const tokenCount = cue.tokens.length;
    const compact: CompactCue = {
      startSec: cue.startSec,
      endSec: cue.endSec,
      tokenStart,
      tokenCount,
      matchedRatio: cue.matchedRatio,
      gapEpubTokens: cue.gapEpubTokens,
    };
    tokenStart += tokenCount;
    return compact;
  });

  return {
    cues: compactCues,
    tokens: {
      count,
      startSec: encodeFloat32(startSec),
      endSec: encodeFloat32(endSec),
      epubSeq: encodeInt32(epubSeq),
      rawText,
      rawLengths: encodeUint32(rawLengths),
    },
  };
}

/** Client-side inverse of `encodeAlignedCues`, restoring the exact
 * `AlignedCue[]` shape the UI already renders (browser-safe: no node/jsdom
 * imports here or in typed-base64.ts). */
export function decodeAlignedCues(
  cues: Array<CompactCue>,
  tokens: CompactTokenTable,
): Array<AlignedCue> {
  const startSec = decodeFloat32(tokens.startSec);
  const endSec = decodeFloat32(tokens.endSec);
  const epubSeq = decodeInt32(tokens.epubSeq);
  const rawLengths = decodeUint32(tokens.rawLengths);

  // Running UTF-16 code-unit offset across the WHOLE flat table (not reset
  // per cue) — rawText is one concatenation of every token's raw string in
  // flat order, so each token's slice start is the sum of every prior
  // token's length. .length/slice on strings both operate on UTF-16 code
  // units, so this is safe even when a token's raw contains surrogate pairs.
  let offset = 0;
  const rawSlices = new Array<string>(tokens.count);
  for (let i = 0; i < tokens.count; i++) {
    const len = rawLengths[i]!;
    rawSlices[i] = tokens.rawText.slice(offset, offset + len);
    offset += len;
  }

  return cues.map((cue): AlignedCue => {
    const tokenList = new Array<AlignedToken>(cue.tokenCount);
    for (let i = 0; i < cue.tokenCount; i++) {
      const seq = cue.tokenStart + i;
      const epubSeqValue = epubSeq[seq]!;
      tokenList[i] = {
        raw: rawSlices[seq]!,
        startSec: startSec[seq]!,
        endSec: endSec[seq]!,
        matched: epubSeqValue >= 0,
        epubSeq: epubSeqValue >= 0 ? epubSeqValue : null,
      };
    }
    return {
      startSec: cue.startSec,
      endSec: cue.endSec,
      tokens: tokenList,
      matchedRatio: cue.matchedRatio,
      gapEpubTokens: cue.gapEpubTokens,
    };
  });
}
