/**
 * Client-side artifact contract for the AlignmentViewer (plan
 * thoughts/plans/bookplayer-align-refine-model.md, T4.1). Two jobs, kept
 * separate:
 *
 *  - fetchArtifact: the one honest fetch contract for GET
 *    /api/alignment/:bookId (Codex #2) — ready/unavailable is a real state
 *    the viewer must render, not an error; everything else throws.
 *  - prepareAlignment: a single derive pass that COMPOSES the Phase 1
 *    helpers from @prosodio/align/browser (deriveTokenTimes,
 *    deriveTokenEndTimes, deriveEpubSeq, deriveCueAggregates). The derive
 *    policy itself (word-timing collapse, gap attribution, span math) lives
 *    and is tested exactly once in packages/align/src/artifact-derive.ts;
 *    this module only assembles those columns plus the one thing that's
 *    genuinely bookplayer-side — per-cue token-range bookkeeping
 *    (cueTokenStart/cueTokenCount) for row building in the viewer.
 *
 * Browser-safe: this module has no server-runtime or schema-library imports.
 * The artifact is server-built and schema-parsed at build time
 * (packages/align/src/artifact.ts), so it is not re-validated here — pulling
 * that validation library in would drag its runtime into the client bundle
 * for no benefit.
 */
import {
  deriveCueAggregates,
  deriveEpubSeq,
  deriveTokenEndTimes,
  deriveTokenTimes,
} from "@prosodio/align/browser";
import type { AlignmentArtifact } from "@prosodio/align/browser";

export type AlignmentLoadResult =
  { status: "ready"; artifact: AlignmentArtifact } | { status: "unavailable" };

/**
 * Fetches the artifact for one book. 404 means the book has no alignment
 * (missing vtt or epub) — a normal, renderable state, not an error. Any
 * other non-OK response or network failure throws so the viewer's error
 * state catches it.
 */
export async function fetchArtifact(
  bookId: string,
  signal?: AbortSignal,
): Promise<AlignmentLoadResult> {
  const res = await fetch(`/api/alignment/${bookId}`, { signal });
  if (res.status === 404) {
    return { status: "unavailable" };
  }
  if (!res.ok) {
    throw new Error(
      `alignment fetch failed for ${bookId}: ${res.status} ${res.statusText}`,
    );
  }
  const artifact = (await res.json()) as AlignmentArtifact;
  return { status: "ready", artifact };
}

export interface PreparedAlignment {
  artifact: AlignmentArtifact;
  /** Per-token start time, seconds (deriveTokenTimes). */
  tokenStart: number[];
  /** Per-token end time, seconds (deriveTokenEndTimes). */
  tokenEnd: number[];
  /** Flat VTT seq -> flat EPUB seq, -1 unmatched (deriveEpubSeq). */
  epubSeq: number[];
  /** Matched-token fraction per cue; 0 for a zero-token cue. */
  matchedRatio: number[];
  /** EPUB tokens skipped by a gap, attributed to the preceding cue. */
  gapEpubTokens: number[];
  /** Gap EPUB tokens with no preceding word (gap at the stream start). */
  leadingGapEpubTokens: number;
  /** First flat VTT token index for each cue; -1 for a zero-token cue. */
  cueTokenStart: number[];
  /** Token count for each cue; 0 for a zero-token cue. */
  cueTokenCount: number[];
}

/**
 * One derive pass over a fetched artifact: composes the Phase 1 helpers plus
 * the per-cue token-range bookkeeping the viewer needs to build rows (T4.2).
 */
export function prepareAlignment(
  artifact: AlignmentArtifact,
): PreparedAlignment {
  const tokenStart = deriveTokenTimes(artifact.vtt, artifact.source.vttTiming);
  const tokenEnd = deriveTokenEndTimes(tokenStart, artifact.vtt);
  const tokenCount = artifact.vtt.tokens.cueIndex.length;
  const epubSeq = deriveEpubSeq(artifact.match.spans, tokenCount);
  const { matchedRatio, gapEpubTokens, leadingGapEpubTokens } =
    deriveCueAggregates(artifact.vtt, epubSeq, artifact.match.gaps);
  const { cueTokenStart, cueTokenCount } = deriveCueTokenRanges(artifact.vtt);

  return {
    artifact,
    tokenStart,
    tokenEnd,
    epubSeq,
    matchedRatio,
    gapEpubTokens,
    leadingGapEpubTokens,
    cueTokenStart,
    cueTokenCount,
  };
}

/**
 * First flat token index and token count per cue, in one pass over the
 * non-decreasing cueIndex column. A cue with no tokens (e.g. a music-note-
 * only cue) gets start -1, count 0 rather than an arbitrary index.
 */
function deriveCueTokenRanges(vtt: AlignmentArtifact["vtt"]): {
  cueTokenStart: number[];
  cueTokenCount: number[];
} {
  const cueCount = vtt.cues.startSec.length;
  const cueTokenStart = new Array<number>(cueCount).fill(-1);
  const cueTokenCount = new Array<number>(cueCount).fill(0);
  const { cueIndex } = vtt.tokens;
  for (let i = 0; i < cueIndex.length; i++) {
    const cue = cueIndex[i]!;
    if (cueTokenStart[cue] === -1) {
      cueTokenStart[cue] = i;
    }
    cueTokenCount[cue] = (cueTokenCount[cue] ?? 0) + 1;
  }
  return { cueTokenStart, cueTokenCount };
}
