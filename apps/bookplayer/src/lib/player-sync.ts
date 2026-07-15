/**
 * Route-level sync core (plan thoughts/plans/player-sync-core.md, S1/S2): owns
 * the alignment artifact fetch + prepare pass and derives the active
 * token/cue from the playhead, so reader-follow works from the route
 * regardless of whether the alignment panel is mounted. AlignmentViewer
 * subscribes to this state (`prepared`/`activeTokenSeq`/`activeCueIndex`)
 * instead of deriving it itself — see AlignmentViewer's own header comment.
 */
import { useEffect, useMemo, useState } from "react";

import {
  activeTokenAt,
  buildSegPathIndex,
  epubSeqAtDomPoint,
  segIndexForTextNode,
  tokenRaw,
  vttSeqForEpubSeq,
} from "@prosodio/align/browser";
import type { SegPathIndex } from "@prosodio/align/browser";

import { fetchArtifact, prepareAlignment } from "#/lib/alignment-client";
import type { PreparedAlignment } from "#/lib/alignment-client";

/** One active/double-clicked VTT token, resolved against the EPUB side. */
export interface ActiveTokenInfo {
  vttSeq: number;
  epubSeq: number | null;
  raw: string;
}

type SyncState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unavailable" }
  | { status: "ready"; prepared: PreparedAlignment };

export interface PlayerSync {
  status: SyncState["status"];
  prepared: PreparedAlignment | null;
  activeTokenSeq: number;
  activeCueIndex: number;
  activeToken: ActiveTokenInfo | null;
}

/**
 * Fetches + prepares the alignment artifact for `bookId` and derives the
 * active token/cue from `currentTime`. `enabled` is the route's `canAlign`
 * gate (book has both EPUB + VTT); when false, stays "unavailable" without
 * fetching.
 */
export function usePlayerSync(
  bookId: string,
  currentTime: number,
  enabled: boolean,
): PlayerSync {
  const [state, setState] = useState<SyncState>({ status: "loading" });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: "loading" });
    fetchArtifact(bookId, controller.signal)
      .then((result) => {
        if (cancelled) return;
        if (result.status === "unavailable") {
          setState({ status: "unavailable" });
          return;
        }
        setState({
          status: "ready",
          prepared: prepareAlignment(result.artifact),
        });
      })
      .catch((error: unknown) => {
        if (!cancelled && !controller.signal.aborted && !isAbortError(error)) {
          setState({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bookId, enabled]);

  // One global binary search over the derived flat token intervals — replaces
  // the old two-step cue-then-token search.
  const activeTokenSeq = useMemo(
    () =>
      state.status === "ready"
        ? activeTokenAt(
            state.prepared.tokenStart,
            state.prepared.tokenEnd,
            currentTime,
          )
        : -1,
    [state, currentTime],
  );

  const activeCueIndex = useMemo(() => {
    if (state.status !== "ready" || activeTokenSeq < 0) return -1;
    return state.prepared.artifact.vtt.tokens.cueIndex[activeTokenSeq] ?? -1;
  }, [state, activeTokenSeq]);

  const activeToken = useMemo<ActiveTokenInfo | null>(
    () =>
      state.status === "ready" && activeTokenSeq >= 0
        ? {
            vttSeq: activeTokenSeq,
            epubSeq:
              (state.prepared.epubSeq[activeTokenSeq] ?? -1) >= 0
                ? state.prepared.epubSeq[activeTokenSeq]!
                : null,
            raw: tokenRaw(state.prepared.artifact.vtt, activeTokenSeq),
          }
        : null,
    [state, activeTokenSeq],
  );

  return {
    status: state.status,
    prepared: state.status === "ready" ? state.prepared : null,
    activeTokenSeq,
    activeCueIndex,
    activeToken,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

/** A book-side DOM point reported by EpubReader's `onWordActivate` (plan S4):
 * the section's epub.js href plus the text-node/offset a dblclick resolved
 * to. Deliberately a structural duplicate of EpubReader's
 * `WordActivatePoint` rather than an import — this module (and the package
 * it composes) stays free of any EpubReader/component dependency. */
export interface BookPoint {
  sectionHref: string;
  node: Node;
  offset: number;
}

export type SeekTarget =
  | { vttSeq: number; timeSec: number; exact: boolean }
  | { error: "spine-not-found" | "node-not-located" | "no-match-forward" };

// Per-prepared-artifact, per-spine SegPathIndex memo (T2.1's buildSegPathIndex
// is the expensive part of segIndexForTextNode — rebuilding it on every
// dblclick would be wasteful). Keyed by PreparedAlignment identity via
// WeakMap rather than a field on PreparedAlignment itself, which must stay a
// plain immutable value (S1/S2's data-not-store discipline).
const segPathIndexCache = new WeakMap<
  PreparedAlignment,
  Map<number, SegPathIndex>
>();

function segPathIndexForSpine(
  prepared: PreparedAlignment,
  spineIdx: number,
): SegPathIndex {
  let perSpine = segPathIndexCache.get(prepared);
  if (!perSpine) {
    perSpine = new Map();
    segPathIndexCache.set(prepared, perSpine);
  }
  let index = perSpine.get(spineIdx);
  if (!index) {
    index = buildSegPathIndex(
      prepared.artifact.epub.spines[spineIdx]!.segPaths,
    );
    perSpine.set(spineIdx, index);
  }
  return index;
}

/**
 * Pure reverse-sync mapping (plan S3/S4/S5): a clicked book DOM point ->
 * matched VTT seq + seek time, composing the T2.1 package helpers. The
 * section root used to resolve `point.node`'s seg path is
 * `point.node.ownerDocument` — the epub.js section content document the
 * click came from — rather than a separate parameter; that document is
 * always reachable off the node itself and is exactly the root
 * `segIndexForTextNode` needs to walk.
 *
 * Error cases (no snapping across these — see epub-dom-point.ts's forward-
 * bias policy for what DOES get snapped):
 *  - "spine-not-found": `point.sectionHref` doesn't match any artifact spine
 *    by the same suffix rule EpubReader's `locate` uses.
 *  - "node-not-located": the node isn't under a resolvable document, or its
 *    DOM path isn't in that spine's segPaths table (section reflowed since
 *    extraction, or the click landed outside any tracked text).
 *  - "no-match-forward": nothing matched forward of the point — either past
 *    the spine's last EPUB token (v1 scope: a click past a section's last
 *    token does NOT cross into the next spine/section to find one — the
 *    reverse mapping stays within the clicked section), or past the last
 *    matched span in the whole book (trailing unmatched content).
 */
export function seekTargetForBookPoint(
  prepared: PreparedAlignment,
  point: BookPoint,
): SeekTarget {
  const { spines } = prepared.artifact.epub;
  const spineIdx = spines.findIndex(
    (spine) =>
      spine.href.endsWith(point.sectionHref) ||
      point.sectionHref.endsWith(spine.href),
  );
  if (spineIdx < 0) return { error: "spine-not-found" };

  const root = point.node.ownerDocument;
  if (!root) return { error: "node-not-located" };

  const segIndex = segIndexForTextNode(
    root,
    segPathIndexForSpine(prepared, spineIdx),
    point.node,
  );
  if (segIndex === null) return { error: "node-not-located" };

  const epubSeq = epubSeqAtDomPoint(
    prepared.artifact.epub.tokens,
    spineIdx,
    segIndex,
    point.offset,
  );
  if (epubSeq === null) return { error: "no-match-forward" };

  const matched = vttSeqForEpubSeq(prepared.artifact.match.spans, epubSeq);
  if (matched === null) return { error: "no-match-forward" };

  return {
    vttSeq: matched.vttSeq,
    timeSec: prepared.tokenStart[matched.vttSeq]!,
    exact: matched.exact,
  };
}
