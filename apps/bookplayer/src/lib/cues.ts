/**
 * Shared time-interval selection for the playback-following views. Cues and
 * tokens are both half-open [startSec, endSec) intervals sorted by start; the
 * transcript strip and AlignmentViewer follow audio currentTime the same way.
 * Playback sync keys on the active TOKEN (its own interpolated interval), not
 * the whole cue — the cue is only a presentation group (plan D7).
 */

export interface TimedCue {
  startSec: number;
  endSec: number;
}

/** Index of the interval containing t, else -1 (intervals sorted by start). */
function activeIntervalIndex(items: Array<TimedCue>, t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const item = items[mid];
    if (!item) break;
    if (item.startSec <= t) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate < 0) return -1;
  const item = items[candidate];
  return item && item.endSec > t ? candidate : -1;
}

/** Index of the cue containing t, else -1. */
export function activeCueIndex(cues: Array<TimedCue>, t: number): number {
  return activeIntervalIndex(cues, t);
}

/** Index of the token whose interpolated interval contains t, else -1. */
export function activeTokenIndex(tokens: Array<TimedCue>, t: number): number {
  return activeIntervalIndex(tokens, t);
}
