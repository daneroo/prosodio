import { describe, expect, test } from "bun:test";

import { START, applyTick, readClock } from "./remote-clock.ts";
import type { RemoteClock, TickKind } from "./remote-clock.ts";

/** Ticks as [seconds since start, audio position]; item "A" unless given. */
function play(
  ticks: Array<[number, number, string?]>,
  from: RemoteClock = START,
): { clock: RemoteClock; kinds: Array<TickKind> } {
  let clock = from;
  const kinds: Array<TickKind> = [];
  for (const [atSec, audioPosition, itemId = "A"] of ticks) {
    const applied = applyTick(clock, {
      itemId,
      audioPosition,
      duration: null,
      receivedAt: atSec * 1000,
    });
    clock = applied.clock;
    kinds.push(applied.kind);
  }
  return { clock, kinds };
}

const readAt = (clock: RemoteClock, atSec: number) =>
  readClock(clock, atSec * 1000);

describe("remote clock", () => {
  test("has no reading before the first tick", () => {
    expect(readAt(START, 5)).toBeNull();
  });

  test("web player cadence (10 s) at 1×: runs between ticks", () => {
    const { clock, kinds } = play([
      [0, 100],
      [10, 110],
      [20, 120],
    ]);
    expect(kinds).toEqual(["first", "steady", "steady"]);
    expect(clock.rate).toBeCloseTo(1);
    expect(readAt(clock, 25)).toEqual({
      audioPosition: 125,
      frozen: false,
      tickAgeMs: 5000,
    });
  });

  test("Android cadence (15 s ± 1 s jitter) at 1.7×: rate reaches 1.7 within two ticks", () => {
    const gaps = [16, 14, 15.5, 14.5, 16];
    let at = 0;
    let position = 600;
    const ticks: Array<[number, number]> = [[at, position]];
    for (const gap of gaps) {
      at += gap;
      position += gap * 1.7;
      ticks.push([at, position]);
    }
    expect(play(ticks.slice(0, 2)).clock.rate).toBeCloseTo(1.7);
    const { clock } = play(ticks);
    expect(clock.rate).toBeCloseTo(1.7);
    expect(readAt(clock, at + 10)?.audioPosition).toBeCloseTo(position + 17);
  });

  test("pause: ticks stop, the clock freezes and holds without rewinding", () => {
    const { clock } = play([
      [0, 100],
      [10, 110],
    ]);
    expect(readAt(clock, 24)).toEqual({
      audioPosition: 124,
      frozen: false,
      tickAgeMs: 14_000,
    });
    const held = { audioPosition: 125, frozen: true };
    expect(readAt(clock, 40)).toMatchObject(held);
    expect(readAt(clock, 600)).toMatchObject(held);
  });

  test("resume after a pause: adopts the new position, keeps the rate", () => {
    // 1.7×, paused at 12 s, resumed at 70 s, next tick at 80 s.
    const { clock, kinds } = play([
      [0, 100],
      [10, 117],
      [80, 117 + 2 * 1.7 + 10 * 1.7],
    ]);
    expect(kinds.at(-1)).toBe("after-gap");
    expect(clock.rate).toBeCloseTo(1.7);
    expect(readAt(clock, 85)).toMatchObject({
      audioPosition: 117 + 12 * 1.7 + 5 * 1.7,
      frozen: false,
    });
  });

  test("a gap spanning a short pause doesn't skew the rate", () => {
    // 1.7×, paused for 10 s within a 35 s gap: derived 1.21× looks plausible.
    const { clock, kinds } = play([
      [0, 100],
      [10, 117],
      [45, 117 + 25 * 1.7],
    ]);
    expect(kinds.at(-1)).toBe("after-gap");
    expect(clock.rate).toBeCloseTo(1.7);
  });

  test("skip forward or back: a jump adopts the position, keeps the rate", () => {
    const forward = play([
      [0, 100],
      [10, 110],
      [20, 400],
    ]);
    expect(forward.kinds.at(-1)).toBe("jump");
    expect(forward.clock.rate).toBeCloseTo(1);
    expect(readAt(forward.clock, 22)?.audioPosition).toBeCloseTo(402);

    const back = play([
      [0, 100],
      [10, 110],
      [20, 50],
    ]);
    expect(back.kinds.at(-1)).toBe("jump");
    expect(back.clock.rate).toBeCloseTo(1);
    expect(readAt(back.clock, 22)?.audioPosition).toBeCloseTo(52);
  });

  test("speed change: the mixed tick lands between, the next one catches up", () => {
    // 1× until 15 s, then 2×.
    const mixed = play([
      [0, 100],
      [10, 110],
      [20, 125],
    ]);
    expect(mixed.clock.rate).toBeCloseTo(1.5);
    const next = play([[30, 145]], mixed.clock);
    expect(next.clock.rate).toBeCloseTo(2);
  });

  test("book switch: restarts on the new item and carries the rate over", () => {
    const { clock, kinds } = play([
      [0, 100],
      [10, 117],
      [15, 30, "B"],
    ]);
    expect(kinds.at(-1)).toBe("first");
    expect(clock.rate).toBeCloseTo(1.7);
    expect(clock.last?.itemId).toBe("B");
    expect(readAt(clock, 25)?.audioPosition).toBeCloseTo(47);
  });
});
