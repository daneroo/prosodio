/**
 * Reverse-locator helpers: the inverse path from a clicked point in a
 * browser-parsed EPUB section document back to a flat EPUB token seq
 * (segIndexForTextNode + epubSeqAtDomPoint) and on to a matched VTT token
 * (vttSeqForEpubSeq). Companion to epub-dom-path.ts (DOM path -> Range,
 * forward) and artifact-derive.ts's deriveEpubSeq (VTT seq -> EPUB seq,
 * forward) — this module walks both of those backward. Pure DOM API +
 * columnar-array math only, no jsdom/node imports, so it ships in the
 * browser bundle (browser.ts re-exports it) alongside epub-dom-path.ts.
 *
 * Forward-bias policy (plan player-sync-core S3/S5, Daniel 2026-07-10): a
 * clicked point rarely lands exactly on a token or span boundary. Every
 * "miss" here resolves FORWARD — the next token or matched span at-or-after
 * the point in document order — never backward. `null` means nothing
 * resolvable in that direction at all (past the last token in a spine, or
 * past the last span in the book); callers show a refusal notice rather than
 * guessing backward.
 */
import type { AlignmentArtifact } from "./artifact.ts";
import type { SegPath } from "./epub-dom-path.ts";

type EpubTokenColumns = AlignmentArtifact["epub"]["tokens"];
type MatchSpan = AlignmentArtifact["match"]["spans"][number];

/** Prebuilt lookup table from buildSegPathIndex: segPath.join(",") -> seg index. */
export type SegPathIndex = Map<string, number>;

/**
 * Build the `path.join(",") -> seg index` lookup table once per section, so
 * repeated segIndexForTextNode calls (e.g. one per dblclick) don't rebuild it
 * from segPaths every time. Pass the result as segIndexForTextNode's second
 * argument; passing the raw segPaths array instead also works, it just
 * rebuilds this table on every call.
 */
export function buildSegPathIndex(
  segPaths: ReadonlyArray<SegPath>,
): SegPathIndex {
  const index: SegPathIndex = new Map();
  segPaths.forEach((path, segIndex) => {
    index.set(path.join(","), segIndex);
  });
  return index;
}

function indexInParent(parent: Node, child: Node): number {
  const children = parent.childNodes;
  if (!children) return -1;
  for (let i = 0; i < children.length; i++) {
    if (children[i] === child) return i;
  }
  return -1;
}

/**
 * Walk parentNode from `node` up to `root`, recording the childNodes index
 * at each step — rebuilding the same childNodes-index path that
 * resolveNodeAtPath (epub-dom-path.ts) walks DOWN. Null if `node` is not a
 * descendant of `root` (the walk runs off the top without hitting root), or
 * if a degenerate node's childNodes is undefined (mirrors resolveNodeAtPath's
 * guard: treated as "child not found," never a throw).
 */
function pathFromRoot(root: Node, node: Node): SegPath | null {
  const path: number[] = [];
  let current: Node = node;
  while (current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    const index = indexInParent(parent, current);
    if (index === -1) return null;
    path.unshift(index);
    current = parent;
  }
  return path;
}

/**
 * Inverse of resolveNodeAtPath: given a DOM node (typically a Text node from
 * a dblclick Selection), find its seg index in the per-section segPaths
 * table. Null when `node` isn't under `root`, or its path isn't in the table
 * (e.g. the section DOM changed shape since extraction).
 *
 * Accepts either the raw segPaths array or a prebuilt SegPathIndex (see
 * buildSegPathIndex) — pass the prebuilt index when calling this repeatedly
 * against the same section, since building the Map is the expensive part on
 * a book with a large section.
 */
export function segIndexForTextNode(
  root: Node,
  segPaths: ReadonlyArray<SegPath> | SegPathIndex,
  node: Node,
): number | null {
  const path = pathFromRoot(root, node);
  if (path === null) return null;
  const index =
    segPaths instanceof Map ? segPaths : buildSegPathIndex(segPaths);
  return index.get(path.join(",")) ?? null;
}

/** Leftmost index in [lo, hi) whose spineIndex column value is >= value. */
function lowerBoundSpineIndex(
  spineIndex: ReadonlyArray<number>,
  value: number,
  lo: number,
  hi: number,
): number {
  let left = lo;
  let right = hi;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (spineIndex[mid]! < value) left = mid + 1;
    else right = mid;
  }
  return left;
}

/** Lexicographic compare of (segIndex, offset) points. */
function comparePoints(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
}

/**
 * Inverse of the DOM-locator half of buildEpubTokenColumns (artifact.ts):
 * given a (segIndex, offset) point inside one spine's DOM, find the flat
 * EPUB token seq whose half-open [start, end) range contains it. Relies on
 * two artifact invariants: epub.tokens.spineIndex is non-decreasing (binary
 * search locates the spine's contiguous token range), and within that range
 * tokens are laid out in document order with non-decreasing, non-overlapping
 * (seg, offset) endpoints (epub-extract.ts pushes tokens in
 * normalizeText's raw-text order, one spine at a time).
 *
 * Forward-biased on miss (plan S5): a point that falls between two tokens,
 * or before the spine's first token, resolves to the next token at-or-after
 * it — a multi-seg token (startSeg !== endSeg) is a single contiguous range
 * for this purpose, no different from a single-seg one. Null only when the
 * point is past the spine's last token, or the spine carries no tokens at
 * all.
 */
export function epubSeqAtDomPoint(
  tokens: EpubTokenColumns,
  spineIdx: number,
  segIndex: number,
  offset: number,
): number | null {
  const { spineIndex, endSeg, endOffset } = tokens;
  const lo = lowerBoundSpineIndex(spineIndex, spineIdx, 0, spineIndex.length);
  const hi = lowerBoundSpineIndex(
    spineIndex,
    spineIdx + 1,
    lo,
    spineIndex.length,
  );
  if (lo === hi) return null; // spine has no tokens

  const point: readonly [number, number] = [segIndex, offset];
  // Leftmost token whose end is past the point: for a point inside a token
  // this is that token (its own end is always > any point it contains); for
  // a point in a gap it's the earliest token entirely after the point —
  // exactly the forward-biased result.
  let left = lo;
  let right = hi;
  while (left < right) {
    const mid = (left + right) >>> 1;
    const end: readonly [number, number] = [endSeg[mid]!, endOffset[mid]!];
    if (comparePoints(end, point) > 0) right = mid;
    else left = mid + 1;
  }
  return left < hi ? left : null;
}

/**
 * Inverse of deriveEpubSeq (artifact-derive.ts) — the same
 * `vttStart + (epubSeq - epubStart)` math run in reverse, matching
 * groupMatchedTokensBySpine's forward version in locate-sweep.ts. Given a
 * flat EPUB seq, find the matched VTT seq. Relies on the artifact invariant
 * (enforced by alignmentArtifactSchema) that match.spans is sorted and
 * non-overlapping on both the vtt and epub axes, so one binary search over
 * epubStart/epubEnd locates the answer.
 *
 * Forward-biased on miss (plan S5): an epubSeq that falls in a gap between
 * spans (unmatched EPUB content) snaps to the first token of the next span
 * (`exact: false`). Null when there is no span at or after epubSeq at all —
 * e.g. trailing back matter past the last match — the caller decides whether
 * that's a refusal or something else.
 */
export function vttSeqForEpubSeq(
  spans: ReadonlyArray<MatchSpan>,
  epubSeq: number,
): { vttSeq: number; exact: boolean } | null {
  let left = 0;
  let right = spans.length;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (spans[mid]!.epubEnd <= epubSeq) left = mid + 1;
    else right = mid;
  }
  if (left >= spans.length) return null; // no span at or after epubSeq
  const span = spans[left]!;
  if (span.epubStart <= epubSeq) {
    return {
      vttSeq: span.vttStart + (epubSeq - span.epubStart),
      exact: true,
    };
  }
  return { vttSeq: span.vttStart, exact: false };
}
