/**
 * Follow offset: a constant lead in real seconds, tuned per device, that
 * puts the highlight slightly ahead of the audio (network latency plus the
 * lead the eyes prefer). Applied after the remote clock as a separate pure
 * step: displayed audio position = clock reading + offset × rate.
 */
import type { ClockReading } from "#/lib/remote-clock";

export const DEFAULT_OFFSET_SEC = 1;

const STEP_SEC = 0.1;

export function applyOffset(
  reading: ClockReading,
  offsetSec: number,
  rate: number,
): ClockReading {
  return {
    ...reading,
    audioPosition: reading.audioPosition + offsetSec * rate,
  };
}

/** One 0.1 s step in `direction`, rounded so repeated steps don't drift. */
export function nudgeOffset(offsetSec: number, direction: 1 | -1): number {
  return Math.round((offsetSec + direction * STEP_SEC) * 10) / 10;
}

/** A stored offset, or the default when missing or unparseable. */
export function parseStoredOffset(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_OFFSET_SEC;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_OFFSET_SEC;
}
