/**
 * Shared cue machinery for the time-tracking cue lists (Transcript strip and
 * AlignmentViewer): both follow audio currentTime the same way, by design.
 */

export interface TimedCue {
  startSec: number;
  endSec: number;
}

/** Index of the cue containing t, else -1 (cues sorted by startSec). */
export function activeCueIndex(cues: Array<TimedCue>, t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cue = cues[mid];
    if (!cue) break;
    if (cue.startSec <= t) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate < 0) return -1;
  const cue = cues[candidate];
  return cue && cue.endSec > t ? candidate : -1;
}
