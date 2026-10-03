/**
 * Remote clock: estimates audiobookshelf's audio position between ticks.
 * Pure — no React, no timers; the caller supplies the time.
 *
 * - The rate starts at 1 and is derived from consecutive ticks.
 * - A derived rate outside 0.5–3.5× is a jump (skip): adopt the position,
 *   keep the rate.
 * - A gap over 30 s spans a pause: adopt the position, keep the rate. Not
 *   the 15 s freeze threshold: mobile ticks arrive every 15 s ± jitter.
 * - With no tick for 15 s the clock freezes (a pause is inferred) and holds
 *   where it stopped, a little past the last tick; it never rewinds.
 * - A tick for another item (book switch) restarts the clock, carrying the
 *   rate over.
 */
import type { Tick } from "#/lib/audiobookshelf-socket";

export const FREEZE_AFTER_MS = 15_000;

/** Longer than any cadence while playing (web 10 s, mobile 15 s ± jitter). */
const PAUSE_GAP_MS = 30_000;

/** Plausible playback rates; a derived rate outside this is a jump. */
const MIN_RATE = 0.5;
const MAX_RATE = 3.5;

export interface RemoteClock {
  last: Tick | null;
  rate: number;
}

export const START: RemoteClock = { last: null, rate: 1 };

/** How a tick was read: "after-gap" spans a pause, so its rate is ignored. */
export type TickKind = "first" | "steady" | "jump" | "after-gap";

export interface ClockReading {
  /** Seconds. */
  audioPosition: number;
  frozen: boolean;
  tickAgeMs: number;
}

export function applyTick(
  clock: RemoteClock,
  tick: Tick,
): { clock: RemoteClock; kind: TickKind } {
  const prev = clock.last;
  const adopt = (kind: TickKind, rate = clock.rate) => ({
    clock: { last: tick, rate },
    kind,
  });
  if (!prev || prev.itemId !== tick.itemId) return adopt("first");
  const realSec = (tick.receivedAt - prev.receivedAt) / 1000;
  const derived = (tick.audioPosition - prev.audioPosition) / realSec;
  if (realSec * 1000 > PAUSE_GAP_MS) return adopt("after-gap");
  if (!(derived >= MIN_RATE && derived <= MAX_RATE)) return adopt("jump");
  return adopt("steady", derived);
}

/** null before the first tick. */
export function readClock(
  clock: RemoteClock,
  nowMs: number,
): ClockReading | null {
  const last = clock.last;
  if (!last) return null;
  const tickAgeMs = Math.max(0, nowMs - last.receivedAt);
  const runMs = Math.min(tickAgeMs, FREEZE_AFTER_MS);
  return {
    audioPosition: last.audioPosition + (clock.rate * runMs) / 1000,
    frozen: tickAgeMs > FREEZE_AFTER_MS,
    tickAgeMs,
  };
}
