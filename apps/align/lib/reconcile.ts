import type { MatchedSpan, ResidualGap } from "./contracts.ts";

/**
 * Shared reconciliation: the only way spans enter the accepted set. Enforces
 * bounds, strict monotonicity, and non-overlap in both streams, so no pass —
 * however weak — can move, replace, or cross a stronger accepted span.
 * Passes emit candidates; this gate decides.
 */

export interface StreamBounds {
  vttLength: number;
  epubLength: number;
}

export interface ReconcileResult {
  accepted: MatchedSpan[];
  rejected: { span: MatchedSpan; reason: string }[];
}

export function reconcile(
  existing: readonly MatchedSpan[],
  candidates: readonly MatchedSpan[],
  bounds: StreamBounds,
): ReconcileResult {
  const accepted = [...existing].sort((a, b) => a.vttStart - b.vttStart);
  const rejected: ReconcileResult["rejected"] = [];
  const ordered = [...candidates].sort((a, b) => a.vttStart - b.vttStart);
  for (const span of ordered) {
    const reason = rejectionReason(span, accepted, bounds);
    if (reason) rejected.push({ span, reason });
    else {
      accepted.push(span);
      accepted.sort((a, b) => a.vttStart - b.vttStart);
    }
  }
  return { accepted, rejected };
}

function rejectionReason(
  span: MatchedSpan,
  accepted: readonly MatchedSpan[],
  bounds: StreamBounds,
): string | undefined {
  if (span.vttStart >= span.vttEnd || span.epubStart >= span.epubEnd) {
    return "empty or inverted range";
  }
  if (
    span.vttStart < 0 ||
    span.vttEnd > bounds.vttLength ||
    span.epubStart < 0 ||
    span.epubEnd > bounds.epubLength
  ) {
    return "out of stream bounds";
  }
  for (const other of accepted) {
    const vttBefore = span.vttEnd <= other.vttStart;
    const vttAfter = span.vttStart >= other.vttEnd;
    const epubBefore = span.epubEnd <= other.epubStart;
    const epubAfter = span.epubStart >= other.epubEnd;
    if (!(vttBefore || vttAfter)) return "overlaps an accepted span (vtt)";
    if (!(epubBefore || epubAfter)) return "overlaps an accepted span (epub)";
    // Same side on both axes or it crosses the anchor.
    if (vttBefore !== epubBefore) return "crosses an accepted span";
  }
  return undefined;
}

/**
 * Residual gaps between consecutive accepted spans, including the leading and
 * trailing regions. Zero-width sides are kept (a gap may be empty in one
 * stream and not the other); fully empty gaps are dropped.
 */
export function computeGaps(
  accepted: readonly MatchedSpan[],
  bounds: StreamBounds,
): ResidualGap[] {
  const ordered = [...accepted].sort((a, b) => a.vttStart - b.vttStart);
  const gaps: ResidualGap[] = [];
  let vttAt = 0;
  let epubAt = 0;
  for (const span of ordered) {
    pushGap(gaps, vttAt, span.vttStart, epubAt, span.epubStart);
    vttAt = span.vttEnd;
    epubAt = span.epubEnd;
  }
  pushGap(gaps, vttAt, bounds.vttLength, epubAt, bounds.epubLength);
  return gaps;
}

function pushGap(
  gaps: ResidualGap[],
  vttStart: number,
  vttEnd: number,
  epubStart: number,
  epubEnd: number,
): void {
  if (vttEnd > vttStart || epubEnd > epubStart) {
    gaps.push({ vttStart, vttEnd, epubStart, epubEnd });
  }
}
