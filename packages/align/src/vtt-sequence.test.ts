import { describe, expect, test } from "bun:test";
import { fixturePaths } from "./fixture-paths.ts";
import { buildVttSequence } from "./vtt-sequence.ts";

const aliceVttText = await Bun.file(fixturePaths.aliceVtt).text();

describe("buildVttSequence on the Alice fixture (interpolation path)", () => {
  const sequence = buildVttSequence(aliceVttText);

  test("parses as a provenance-carrying artifact with interpolated timing", () => {
    expect(sequence.provenance?.wordTimestamps).toBe(false);
    expect(sequence.timing).toBe("interpolated");
  });

  test("flattens cues into one normalized word sequence", () => {
    expect(sequence.words.slice(0, 6).map((w) => w.norm)).toEqual([
      "chapter",
      "1",
      "of",
      "alice",
      "s",
      "adventures",
    ]);
    expect(sequence.words.length).toBeGreaterThan(20_000);
  });

  test("seq offsets are contiguous and times are monotonic non-decreasing", () => {
    sequence.words.forEach((word, i) => {
      expect(word.seq).toBe(i);
    });
    for (let i = 1; i < sequence.words.length; i++) {
      expect(sequence.words[i]!.timeSec).toBeGreaterThanOrEqual(
        sequence.words[i - 1]!.timeSec,
      );
    }
  });

  test("word indices restart per cue and interpolate within the cue", () => {
    const cue0 = sequence.words.filter((w) => w.cueIndex === 0);
    expect(cue0.map((w) => w.wordIndex)).toEqual([...cue0.keys()]);
    // First word of a cue starts at the cue start; later words move forward.
    expect(cue0[0]!.timeSec).toBe(0);
    expect(cue0.at(-1)!.timeSec).toBeGreaterThan(0);
  });

  test("cues array is parallel to the flattened cue list, times via vttTimeToSeconds", () => {
    expect(sequence.cues.length).toBeGreaterThan(2_000);
    const maxCueIndex = Math.max(...sequence.words.map((w) => w.cueIndex));
    expect(sequence.cues.length).toBeGreaterThan(maxCueIndex);
    for (const cue of sequence.cues) {
      expect(cue.endSec).toBeGreaterThanOrEqual(cue.startSec);
      expect(typeof cue.text).toBe("string");
    }
  });

  test("each word's charStart/charEnd slices its cue's raw text back to the word's raw", () => {
    for (const word of sequence.words.slice(0, 50)) {
      const cue = sequence.cues[word.cueIndex]!;
      expect(cue.text.slice(word.charStart, word.charEnd)).toBe(word.raw);
    }
  });
});

describe("buildVttSequence timing selection", () => {
  test("wordTimestamps: true uses cue timing directly", () => {
    const vtt = [
      "WEBVTT",
      "",
      "NOTE Provenance",
      '{"input":"x.m4b","model":"tiny.en","wordTimestamps":true,"generated":"2026-01-01T00:00:00.000Z","elapsedMs":1}',
      "",
      "00:00:01.000 --> 00:00:02.000",
      "Hello",
      "",
      "00:00:02.000 --> 00:00:03.000",
      "world",
      "",
    ].join("\n");
    const sequence = buildVttSequence(vtt);
    expect(sequence.timing).toBe("word");
    expect(sequence.words.map((w) => [w.norm, w.timeSec])).toEqual([
      ["hello", 1],
      ["world", 2],
    ]);
  });

  test("raw cue-only VTT falls back to interpolation with no provenance", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00:00.000 --> 00:00:04.000",
      "one two three four",
      "",
    ].join("\n");
    const sequence = buildVttSequence(vtt);
    expect(sequence.timing).toBe("interpolated");
    expect(sequence.provenance).toBeUndefined();
    expect(sequence.words.map((w) => w.timeSec)).toEqual([0, 1, 2, 3]);
  });
});
