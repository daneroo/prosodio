/**
 * Section-level DOM parity gate (design D6 / plan T1.4): before trusting any
 * token locate in a section, validate the WHOLE known segment table
 * (segPaths + segTextLen, captured server-side by projectVisibleText) against
 * the section DOM the browser actually parsed. The server's jsdom tree and
 * epub.js's browser-parsed tree read the same bytes but are not guaranteed to
 * agree (see thoughts/design/bookplayer-align-refine-model.md, "The DOM
 * path") — a mode mismatch or parser edge case shifts childNodes indices, and
 * every segPath captured after the shift point fails together. Checking the
 * whole table once per section, on first load, turns that into one
 * structured report instead of N token-locate failures discovered one at a
 * time during playback.
 *
 * LIMITATION (Codex #4, stated here per D6): this is segment PATH/LENGTH
 * parity, not a proof the browser tree has no MORE text than the server tree
 * captured. Extra browser-only text nodes (e.g. injected by an epub.js
 * post-parse hook) are only caught insofar as they shift a later segment's
 * childNodes index — an extra text node appended after the last known
 * segment, or one that does not perturb any captured path, passes this check
 * silently. The per-token text-equality guard at locate time remains the last
 * line of defense against that gap.
 *
 * Pure DOM API only (no jsdom/node imports) so this module ships in the
 * browser bundle unmodified, alongside epub-dom-path.ts.
 */
import { resolveNodeAtPath } from "./epub-dom-path.ts";
import type { DomPathNodeResult, SegPath } from "./epub-dom-path.ts";

export type SectionParityResult =
  | { ok: true; segCount: number }
  | {
      ok: false;
      reason: "seg-table-mismatch" | "seg-path-failed" | "seg-length-mismatch";
      expectedSegCount: number;
      firstDivergentSeg?: number; // index into segPaths
      detail?: unknown; // DomPathNodeResult or { expected, actual } lengths
    };

/**
 * Walk `segPaths` in order, resolving each against `root` and comparing its
 * Text node's length to the parallel `segTextLen` entry. Stops at the first
 * divergence — this runs on section load in the browser, so cheapness beyond
 * the first failure matters more than an exhaustive report.
 */
export function checkSectionParity(
  root: Node,
  segPaths: ReadonlyArray<SegPath>,
  segTextLen: ReadonlyArray<number>,
): SectionParityResult {
  // Defensive: the artifact schema already guarantees segPaths.length ===
  // segTextLen.length server-side, but this module can be handed raw arrays
  // (e.g. from a not-yet-validated fetch), so check rather than trust.
  if (segPaths.length !== segTextLen.length) {
    return {
      ok: false,
      reason: "seg-table-mismatch",
      expectedSegCount: segPaths.length,
    };
  }

  for (let i = 0; i < segPaths.length; i++) {
    const path = segPaths[i]!;
    const resolved: DomPathNodeResult = resolveNodeAtPath(root, path);
    if (!resolved.ok) {
      return {
        ok: false,
        reason: "seg-path-failed",
        expectedSegCount: segPaths.length,
        firstDivergentSeg: i,
        detail: resolved,
      };
    }
    const actual = resolved.node.nodeValue?.length ?? 0;
    const expected = segTextLen[i]!;
    if (actual !== expected) {
      return {
        ok: false,
        reason: "seg-length-mismatch",
        expectedSegCount: segPaths.length,
        firstDivergentSeg: i,
        detail: { expected, actual },
      };
    }
  }

  return { ok: true, segCount: segPaths.length };
}
