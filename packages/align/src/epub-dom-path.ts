/**
 * Native DOM locator for an EPUB token: a childNodes index path from a
 * content-document root down to a Text node, plus a UTF-16 offset in it.
 * Captured once during extraction (epub-extract.ts) and resolved later by
 * walking a browser-parsed section DOM — no re-normalization, no text
 * re-projection. Pure DOM API only (no jsdom/node imports) so this module can
 * run unmodified in the browser.
 */

/** childNodes index chain from a content-document root to a Text node. */
export type SegPath = number[];

/**
 * A token's DOM range endpoints, expressed as segment indices (into a
 * per-document SegPath table, in document order) plus UTF-16 offsets within
 * those Text nodes. `end` is exclusive, matching normalize.ts token ranges.
 * `startSeg !== endSeg` when a token spans adjacent inline Text nodes (e.g.
 * `<em>hel</em>lo`).
 */
export interface DomTokenLocator {
  startSeg: number;
  startOffset: number;
  endSeg: number;
  endOffset: number;
}

export type DomPathNodeResult =
  | { ok: true; node: Text; path: SegPath }
  | {
      ok: false;
      path: SegPath;
      reason: "missing-child" | "not-text-node";
      failedAt: number;
      requestedIndex?: number;
      childCount?: number;
      nodeType?: number;
      nodeName?: string;
    };

export type DomPathRangeFailure =
  | { reason: "missing-segment"; segment: "start" | "end"; segIndex: number }
  | { reason: "start-path-failed"; path: DomPathNodeResult }
  | { reason: "end-path-failed"; path: DomPathNodeResult }
  | {
      reason: "start-offset-out-of-range" | "end-offset-out-of-range";
      offset: number;
      length: number;
    };

export type DomPathRangeDiagnostic =
  { ok: true; range: Range } | { ok: false; failure: DomPathRangeFailure };

/** Walk root by a childNodes index path and explain why it fails. */
function resolveNodeAtPath(root: Node, path: SegPath): DomPathNodeResult {
  let node: Node = root;
  for (const [failedAt, index] of path.entries()) {
    const child: ChildNode | undefined = node.childNodes[index];
    if (child === undefined) {
      return {
        ok: false,
        path,
        reason: "missing-child",
        failedAt,
        requestedIndex: index,
        childCount: node.childNodes.length,
        nodeType: node.nodeType,
        nodeName: node.nodeName,
      };
    }
    node = child;
  }
  if (node.nodeType !== 3 /* TEXT_NODE */) {
    return {
      ok: false,
      path,
      reason: "not-text-node",
      failedAt: path.length,
      nodeType: node.nodeType,
      nodeName: node.nodeName,
    };
  }
  return { ok: true, node: node as Text, path };
}

/**
 * Resolve a captured locator against a (possibly freshly parsed) DOM rooted
 * at `root`, using the parallel segment-path table captured alongside it.
 * Returns null — never throws — for any mismatch: missing path step, a path
 * that no longer lands on a Text node, or an offset out of range. Callers
 * treat null as "skip this highlight," never as a mis-highlight.
 */
export function rangeFromDomPath(
  root: Node,
  segPaths: ReadonlyArray<SegPath>,
  loc: DomTokenLocator,
): Range | null {
  const diagnostic = diagnoseRangeFromDomPath(root, segPaths, loc);
  return diagnostic.ok ? diagnostic.range : null;
}

/** Same resolver as `rangeFromDomPath`, but preserves the failing step. */
export function diagnoseRangeFromDomPath(
  root: Node,
  segPaths: ReadonlyArray<SegPath>,
  loc: DomTokenLocator,
): DomPathRangeDiagnostic {
  const startPath = segPaths[loc.startSeg];
  const endPath = segPaths[loc.endSeg];
  if (startPath === undefined) {
    return {
      ok: false,
      failure: {
        reason: "missing-segment",
        segment: "start",
        segIndex: loc.startSeg,
      },
    };
  }
  if (endPath === undefined) {
    return {
      ok: false,
      failure: {
        reason: "missing-segment",
        segment: "end",
        segIndex: loc.endSeg,
      },
    };
  }

  const startNode = resolveNodeAtPath(root, startPath);
  if (!startNode.ok) {
    return {
      ok: false,
      failure: { reason: "start-path-failed", path: startNode },
    };
  }
  const endNode = resolveNodeAtPath(root, endPath);
  if (!endNode.ok) {
    return { ok: false, failure: { reason: "end-path-failed", path: endNode } };
  }

  const startLength = startNode.node.nodeValue?.length ?? 0;
  const endLength = endNode.node.nodeValue?.length ?? 0;
  if (loc.startOffset < 0 || loc.startOffset > startLength) {
    return {
      ok: false,
      failure: {
        reason: "start-offset-out-of-range",
        offset: loc.startOffset,
        length: startLength,
      },
    };
  }
  if (loc.endOffset < 0 || loc.endOffset > endLength) {
    return {
      ok: false,
      failure: {
        reason: "end-offset-out-of-range",
        offset: loc.endOffset,
        length: endLength,
      },
    };
  }

  const ownerDocument = root.ownerDocument ?? (root as Document);
  const range = ownerDocument.createRange();
  range.setStart(startNode.node, loc.startOffset);
  range.setEnd(endNode.node, loc.endOffset);
  return { ok: true, range };
}
