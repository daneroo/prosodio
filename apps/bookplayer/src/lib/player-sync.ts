/**
 * Route-level sync core (plan thoughts/plans/player-sync-core.md, S1/S2): owns
 * the alignment artifact fetch + prepare pass and derives the active
 * token/cue from the playhead, so reader-follow works from the route
 * regardless of whether the alignment panel is mounted. AlignmentViewer
 * subscribes to this state (`prepared`/`activeTokenSeq`/`activeCueIndex`)
 * instead of deriving it itself — see AlignmentViewer's own header comment.
 */
import { useEffect, useMemo, useState } from "react";

import { activeTokenAt, tokenRaw } from "@prosodio/align/browser";

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
    let cancelled = false;
    setState({ status: "loading" });
    fetchArtifact(bookId)
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
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
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
