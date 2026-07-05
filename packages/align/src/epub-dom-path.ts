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

/** Walk root by a childNodes index path to the Text node it names, or null. */
function nodeAtPath(root: Node, path: SegPath): Text | null {
  let node: Node = root;
  for (const index of path) {
    const child: ChildNode | undefined = node.childNodes[index];
    if (child === undefined) return null;
    node = child;
  }
  return node.nodeType === 3 /* TEXT_NODE */ ? (node as Text) : null;
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
  const startPath = segPaths[loc.startSeg];
  const endPath = segPaths[loc.endSeg];
  if (startPath === undefined || endPath === undefined) return null;

  const startNode = nodeAtPath(root, startPath);
  const endNode = nodeAtPath(root, endPath);
  if (startNode === null || endNode === null) return null;

  const startLength = startNode.nodeValue?.length ?? 0;
  const endLength = endNode.nodeValue?.length ?? 0;
  if (loc.startOffset < 0 || loc.startOffset > startLength) return null;
  if (loc.endOffset < 0 || loc.endOffset > endLength) return null;

  const ownerDocument = root.ownerDocument ?? (root as Document);
  const range = ownerDocument.createRange();
  range.setStart(startNode, loc.startOffset);
  range.setEnd(endNode, loc.endOffset);
  return range;
}
