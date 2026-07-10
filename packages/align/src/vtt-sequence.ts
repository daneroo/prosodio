import {
  parseVtt,
  vttTimeToSeconds,
  type ProvenanceComposition,
  type ProvenanceTranscription,
  type VttCue,
} from "@prosodio/vtt";
import { interpolateWordTimes } from "./cue-times.ts";
import { normalizeText } from "./normalize.ts";

/**
 * Flatten a parsed VTT into one word sequence for matching. Textual positions
 * decide matches; time is for ordering, navigation, and anomaly metrics only.
 * Word-level timestamps are not required: with `wordTimestamps: true` the cue
 * timing is used directly, otherwise word starts are interpolated within each
 * cue — preserving the parser-checked non-decreasing cue order, not claiming
 * word-level accuracy.
 */

export interface VttWord {
  /** Normalized token text — what matching operates on. */
  norm: string;
  /** Raw source slice, for diagnostics. */
  raw: string;
  /** Offset in the flat word sequence. */
  seq: number;
  cueIndex: number;
  /** Word offset within the cue. */
  wordIndex: number;
  /** Monotonic time estimate (seconds). */
  timeSec: number;
  /** Half-open UTF-16 range into `cues[cueIndex].text` — the word's raw slice. */
  charStart: number;
  charEnd: number;
}

export type VttTimingSource = "word" | "interpolated";

export interface VttSequence {
  words: VttWord[];
  timing: VttTimingSource;
  /** Header provenance; absent for raw (provenance-less) VTT files. */
  provenance?: ProvenanceTranscription | ProvenanceComposition;
  warnings: string[];
  /** Flattened cue table, parallel by cueIndex — the same list `words` walks. */
  cues: Array<{ startSec: number; endSec: number; text: string }>;
}

export function buildVttSequence(vttText: string): VttSequence {
  const { value: classified, warnings } = parseVtt(vttText);
  let cues: VttCue[];
  let provenance: VttSequence["provenance"];
  switch (classified.type) {
    case "composition":
      cues = classified.value.segments.flatMap((segment) => segment.cues);
      provenance = classified.value.provenance;
      break;
    case "transcription":
      cues = classified.value.cues;
      provenance = classified.value.provenance;
      break;
    case "raw":
      cues = classified.value.cues;
      break;
  }

  const timing: VttTimingSource = provenance?.wordTimestamps
    ? "word"
    : "interpolated";
  const words: VttWord[] = [];
  const flatCues: VttSequence["cues"] = [];
  cues.forEach((cue, cueIndex) => {
    const start = vttTimeToSeconds(cue.startTime);
    const end = vttTimeToSeconds(cue.endTime);
    flatCues.push({ startSec: start, endSec: end, text: cue.text });
    const tokens = normalizeText(cue.text).tokens;
    const wordTimes =
      timing === "word"
        ? tokens.map(() => start)
        : interpolateWordTimes(start, end, tokens.length);
    tokens.forEach((token, wordIndex) => {
      words.push({
        norm: token.norm,
        raw: token.raw,
        seq: words.length,
        cueIndex,
        wordIndex,
        timeSec: wordTimes[wordIndex]!,
        charStart: token.rawStart,
        charEnd: token.rawEnd,
      });
    });
  });

  return provenance
    ? { words, timing, provenance, warnings, cues: flatCues }
    : { words, timing, warnings, cues: flatCues };
}
