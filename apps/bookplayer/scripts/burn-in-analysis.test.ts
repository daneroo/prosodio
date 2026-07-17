import { describe, expect, test } from "bun:test";

import {
  analyzeBurnInPair,
  analyzeMetric,
  compareAudioRange,
} from "./burn-in-analysis.ts";

import type { BurnInEvent } from "./burn-in-analysis.ts";

const MiB = 1024 * 1024;

describe("compareAudioRange", () => {
  test.each([
    ["bytes=10-19", "bytes 10-19/100", "10"],
    ["bytes=90-", "bytes 90-99/100", "10"],
    ["bytes=-10", "bytes 90-99/100", "10"],
    ["bytes=95-999", "bytes 95-99/100", "5"],
  ])("accepts an exact %s response", (range, contentRange, contentLength) => {
    expect(
      compareAudioRange(requestEvent(range, contentRange, contentLength)),
    ).toBeNull();
  });

  test("reports a server-shortened range", () => {
    expect(
      compareAudioRange(
        requestEvent("bytes=0-", "bytes 0-1048575/4000000", "1048576"),
      ),
    ).toContain("expected bytes 0-3999999/4000000");
  });
});

describe("memory verdicts", () => {
  test("a warmed plateau passes and expected navigation aborts are ignored", () => {
    const first = runWithMemory([90, 100, 101, 100, 100, 100]);
    const repeat = runWithMemory([100, 101, 99, 100, 100, 100]);
    repeat.push({
      type: "request-failure",
      url: "http://localhost/api/audio/book",
      failure: "net::ERR_ABORTED",
    });

    const verdict = analyzeBurnInPair(first, repeat, 16 * MiB);
    expect(verdict.passed).toBe(true);
    expect(verdict.warmedRssDeltaBytes).toBe(0);
    expect(verdict.failures).toEqual([]);
  });

  test("a monotonic final-five leak fails even below the RSS delta limit", () => {
    const verdict = analyzeBurnInPair(
      runWithMemory([90, 100]),
      runWithMemory([100, 101, 102, 103, 104, 105]),
      16 * MiB,
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain(
      "repeat: rssBytes increased across every final-five step",
    );
  });

  test("missing RSS telemetry fails clearly while optional metrics stay optional", () => {
    const verdict = analyzeBurnInPair(
      [{ type: "complete", books: 0 }],
      [{ type: "complete", books: 0 }],
      16 * MiB,
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.warmedRssDeltaBytes).toBeNull();
    expect(verdict.failures).toContain("repeat: RSS telemetry is missing");
  });

  test("calculates delta, slope, and final-five monotonicity", () => {
    const trend = analyzeMetric(
      runWithMemory([1, 3, 5, 7, 9], "externalBytes", 1),
      "externalBytes",
    );
    expect(trend).toEqual({
      samples: 5,
      baseline: 1,
      end: 9,
      delta: 8,
      finalFiveDelta: 8,
      finalFiveSlope: 2,
      monotonicFinalFive: true,
    });
  });

  test("a range mismatch fails the pair verdict", () => {
    const first = runWithMemory([100, 100]);
    const repeat = runWithMemory([100, 100]);
    repeat.push(requestEvent("bytes=0-", "bytes 0-9/100", "10"));
    const verdict = analyzeBurnInPair(first, repeat);
    expect(verdict.passed).toBe(false);
    expect(verdict.rangeMismatches).toHaveLength(1);
  });

  test("a run without a complete event fails as incomplete", () => {
    const first = runWithMemory([100, 100]);
    const repeat = runWithMemory([100, 100]);
    repeat.pop();

    const verdict = analyzeBurnInPair(first, repeat);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain(
      "repeat: complete event is missing (run may have crashed)",
    );
  });
});

function requestEvent(
  range: string,
  contentRange: string,
  contentLength: string,
): BurnInEvent {
  return {
    type: "request",
    endpoint: "audio",
    method: "GET",
    url: "http://localhost/api/audio/book",
    status: 206,
    requestHeaders: { range },
    headers: {
      "content-range": contentRange,
      "content-length": contentLength,
    },
  };
}

function runWithMemory(
  values: Array<number>,
  metric = "rssBytes",
  scale = MiB,
): Array<BurnInEvent> {
  return [
    { type: "selection", links: ["/player/book"] },
    ...values.map((value, iteration) => ({
      type: "memory",
      iteration,
      phase: iteration === 0 ? "baseline" : "after-book",
      [metric]: value * scale,
    })),
    { type: "complete", books: Math.max(0, values.length - 1) },
  ];
}
