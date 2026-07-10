/**
 * Word-time interpolation for a VTT cue lacking word-level timestamps: spread
 * `count` words evenly across `[startSec, endSec)`. Pure and browser-safe (no
 * imports) so it can be shared verbatim between the node-side vtt-sequence
 * builder and the browser-side artifact derive helpers (T1.3) — one formula,
 * never restated.
 */
export function interpolateWordTimes(
  startSec: number,
  endSec: number,
  count: number,
): number[] {
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    times.push(startSec + ((endSec - startSec) * i) / count);
  }
  return times;
}
