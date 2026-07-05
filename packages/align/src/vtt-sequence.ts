import {
  parseVtt,
  vttTimeToSeconds,
  type ProvenanceComposition,
  type ProvenanceTranscription,
  type VttCue,
} from "@prosodio/vtt";
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
}

export type VttTimingSource = "word" | "interpolated";

export interface VttSequence {
  words: VttWord[];
  timing: VttTimingSource;
  /** Header provenance; absent for raw (provenance-less) VTT files. */
  provenance?: ProvenanceTranscription | ProvenanceComposition;
  warnings: string[];
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
  cues.forEach((cue, cueIndex) => {
    const start = vttTimeToSeconds(cue.startTime);
    const end = vttTimeToSeconds(cue.endTime);
    const tokens = normalizeText(cue.text).tokens;
    tokens.forEach((token, wordIndex) => {
      words.push({
        norm: token.norm,
        raw: token.raw,
        seq: words.length,
        cueIndex,
        wordIndex,
        timeSec:
          timing === "word"
            ? start
            : start + ((end - start) * wordIndex) / tokens.length,
      });
    });
  });

  return provenance
    ? { words, timing, provenance, warnings }
    : { words, timing, warnings };
}
