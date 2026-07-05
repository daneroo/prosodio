/**
 * Alignment loading + cue join for the AlignmentViewer (plan
 * thoughts/plans/bookplayer-align.md). The expensive part — running the
 * @prosodio/align engine over the book — is cached on disk per book, keyed by
 * schema version + source mtimes. The cue join (spans -> word-level runs per
 * transcript cue) is cheap, pure, and runs per request. @prosodio/align is
 * imported dynamically so jsdom/epub-ts never enter a client module graph.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { buildEpubLocatorIndex } from "./epub-locator.ts";
import { assetPath } from "./media.ts";
import type { BookplayerConfig } from "./config.ts";
import type { EpubLocatorIndex } from "./epub-locator.ts";
import type { TranscriptCue } from "./transcript.ts";
import type { BookRecord } from "./types.ts";
import type { AlignmentResult, EpubExtraction } from "@prosodio/align";

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

export type AlignmentPayload =
  | { status: "unavailable" }
  | {
      status: "ready";
      summary: AlignmentSummary;
      cues: Array<AlignedCue>;
      epub: EpubLocatorIndex;
    };

/** The subset of VttWord the join needs (keeps tests synthetic-friendly). */
export interface JoinWord {
  cueIndex: number;
  raw: string;
  /** Interpolated token START time (seconds); end = next token's start. */
  timeSec: number;
}

export interface JoinSpan {
  vttStart: number;
  vttEnd: number;
  /** First flat EPUB token this span maps to; exact spans are equal-length,
   * so a matched word at vttSeq resolves to `epubStart + (vttSeq - vttStart)`. */
  epubStart: number;
}

export interface JoinGap {
  vttStart: number;
  vttEnd: number;
  epubStart: number;
  epubEnd: number;
}

/**
 * Join word-level span coverage onto transcript cues. Words are the flat VTT
 * sequence (seq = array index); spans/gaps are half-open token ranges over it,
 * sorted and non-overlapping (the engine's reconciliation invariant).
 */
export function joinAlignedCues(
  cues: Array<TranscriptCue>,
  words: Array<JoinWord>,
  spans: Array<JoinSpan>,
  gaps: Array<JoinGap>,
): { cues: Array<AlignedCue>; leadingGapEpubTokens: number } {
  const matched = new Array<boolean>(words.length).fill(false);
  const epubSeqAt = new Array<number | null>(words.length).fill(null);
  for (const span of spans) {
    for (let seq = span.vttStart; seq < span.vttEnd; seq++) {
      matched[seq] = true;
      epubSeqAt[seq] = span.epubStart + (seq - span.vttStart);
    }
  }

  // Attribute each residual gap's epub side to the cue containing the last
  // word before the gap; a gap at the stream start becomes the leading marker.
  const gapTokensByCue = new Map<number, number>();
  let leadingGapEpubTokens = 0;
  for (const gap of gaps) {
    const epubTokens = gap.epubEnd - gap.epubStart;
    if (epubTokens <= 0) continue;
    const before = words[gap.vttStart - 1];
    if (!before) {
      leadingGapEpubTokens += epubTokens;
      continue;
    }
    gapTokensByCue.set(
      before.cueIndex,
      (gapTokensByCue.get(before.cueIndex) ?? 0) + epubTokens,
    );
  }

  // Group the flat words back into per-cue token lists (start time only;
  // end times are filled per cue below).
  const tokensByCue = new Map<number, Array<AlignedToken>>();
  words.forEach((word, seq) => {
    let tokens = tokensByCue.get(word.cueIndex);
    if (!tokens) {
      tokens = [];
      tokensByCue.set(word.cueIndex, tokens);
    }
    tokens.push({
      raw: word.raw,
      startSec: word.timeSec,
      endSec: word.timeSec, // provisional; set to the next token's start below
      matched: matched[seq] === true,
      epubSeq: epubSeqAt[seq] ?? null,
    });
  });

  const alignedCues = cues.map((cue, cueIndex): AlignedCue => {
    const tokens = tokensByCue.get(cueIndex);
    if (!tokens || tokens.length === 0) {
      // Degenerate cue: normalization stripped every word (e.g. music-note
      // markers). Render the raw text as one unmatched token spanning the cue.
      return {
        startSec: cue.startSec,
        endSec: cue.endSec,
        tokens:
          cue.text.length > 0
            ? [
                {
                  raw: cue.text,
                  startSec: cue.startSec,
                  endSec: cue.endSec,
                  matched: false,
                  epubSeq: null,
                },
              ]
            : [],
        matchedRatio: 0,
        gapEpubTokens: gapTokensByCue.get(cueIndex) ?? 0,
      };
    }
    // A token ends where the next begins; the last runs to the cue end. Guard
    // non-monotonic interpolation so every interval stays non-empty.
    let matchedCount = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const nextStart = tokens[i + 1]?.startSec ?? cue.endSec;
      token.endSec = Math.max(nextStart, token.startSec);
      if (token.matched) matchedCount++;
    }
    return {
      startSec: cue.startSec,
      endSec: cue.endSec,
      tokens,
      matchedRatio: matchedCount / tokens.length,
      gapEpubTokens: gapTokensByCue.get(cueIndex) ?? 0,
    };
  });

  return { cues: alignedCues, leadingGapEpubTokens };
}

export interface AlignmentCacheKey {
  schemaVersion: number;
  vttMtimeMs: number;
  epubMtimeMs: number;
}

interface CacheFile {
  key: AlignmentCacheKey;
  result: AlignmentResult;
}

function cachePath(config: BookplayerConfig, book: BookRecord): string {
  return join(config.dataDir, "align", `${book.id}.json`);
}

/** null on missing/corrupt file or any key mismatch (never throws). */
export function readAlignmentCache(
  path: string,
  key: AlignmentCacheKey,
): AlignmentResult | null {
  // Parsed shape is unproven: a malformed file must read as a miss.
  let parsed: Partial<CacheFile>;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<CacheFile>;
  } catch {
    return null;
  }
  const cached = parsed.key;
  if (
    cached?.schemaVersion !== key.schemaVersion ||
    cached.vttMtimeMs !== key.vttMtimeMs ||
    cached.epubMtimeMs !== key.epubMtimeMs
  ) {
    return null;
  }
  return parsed.result ?? null;
}

/**
 * The book's AlignmentResult: from the disk cache when fresh, else computed
 * by the engine and written through. null = book lacks a vtt or epub.
 */
export async function loadAlignmentResult(
  config: BookplayerConfig,
  book: BookRecord,
): Promise<AlignmentResult | null> {
  const vttPath = assetPath(config, book, "vtt");
  const epubPath = assetPath(config, book, "epub");
  if (!vttPath || !epubPath) return null;

  const align = await import("@prosodio/align");
  const key: AlignmentCacheKey = {
    schemaVersion: align.ALIGNMENT_RESULT_SCHEMA_VERSION,
    vttMtimeMs: statSync(vttPath).mtimeMs,
    epubMtimeMs: statSync(epubPath).mtimeMs,
  };
  const path = cachePath(config, book);
  const cached = readAlignmentCache(path, key);
  if (cached) return cached;

  const started = performance.now();
  const vttText = readFileSync(vttPath, "utf8");
  const epubBytes = await Bun.file(epubPath).arrayBuffer();
  const alignment = await align.alignBook(vttText, epubBytes);
  const result = align.buildAlignmentResult(alignment, {
    root: config.activeRoot.name,
    base: book.basename,
    vttPath,
    epubPath,
    m4bPath: assetPath(config, book, "audio"),
  });
  console.log(
    `[align] ${book.basename}: spans=${result.metrics.spanCount} in ${(performance.now() - started).toFixed(0)}ms`,
  );

  writeAlignmentCache(path, key, result);
  return result;
}

export function writeAlignmentCache(
  path: string,
  key: AlignmentCacheKey,
  result: AlignmentResult,
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ key, result } satisfies CacheFile));
}

// Extraction LRU of 1: the locator index is rebuilt per request from the same
// open book repeatedly (the on-disk AlignmentResult cache holds the matcher
// output, not this — see plan D7/P2, "derived at request time").
let extractionCache: { key: string; extraction: EpubExtraction } | null = null;

async function extractionFor(epubPath: string): Promise<EpubExtraction> {
  const key = `${epubPath}:${statSync(epubPath).mtimeMs}`;
  if (extractionCache?.key === key) return extractionCache.extraction;
  const { extractEpub, alignConfig } = await import("@prosodio/align");
  const epubBytes = await Bun.file(epubPath).arrayBuffer();
  const extraction = await extractEpub(epubBytes, alignConfig.extraction);
  extractionCache = { key, extraction };
  return extraction;
}

/** Full payload for the AlignmentViewer; joins the cached result onto cues. */
export async function loadAlignment(
  config: BookplayerConfig,
  book: BookRecord,
  cues: Array<TranscriptCue> | null,
): Promise<AlignmentPayload> {
  if (!cues) return { status: "unavailable" };
  const result = await loadAlignmentResult(config, book);
  if (!result) return { status: "unavailable" };

  const { buildVttSequence } = await import("@prosodio/align");
  const vttPath = assetPath(config, book, "vtt");
  const epubPath = assetPath(config, book, "epub");
  if (!vttPath || !epubPath) return { status: "unavailable" };
  const words = buildVttSequence(readFileSync(vttPath, "utf8")).words;

  const joined = joinAlignedCues(cues, words, result.spans, result.gaps);
  const extraction = await extractionFor(epubPath);
  return {
    status: "ready",
    epub: buildEpubLocatorIndex(extraction),
    summary: {
      vttCoverage: result.metrics.vttCoverage,
      epubCoverage: result.metrics.epubCoverage,
      spanCount: result.metrics.spanCount,
      gapCount: result.metrics.gapCount,
      timing: result.source.vttTiming,
      leadingGapEpubTokens: joined.leadingGapEpubTokens,
    },
    cues: joined.cues,
  };
}
