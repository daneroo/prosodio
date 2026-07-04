/**
 * Transcript loading: read the book's matched VTT and map it to lean
 * second-based cues for the client. @prosodio/vtt owns parsing (and its zod
 * schemas stay server-side); every classified VTT type carries cues.
 */
import { readFileSync } from "node:fs";

import { parseVtt, vttTimeToSeconds } from "@prosodio/vtt";

import { assetPath } from "./media.ts";
import type { BookplayerConfig } from "./config.ts";
import type { BookRecord } from "./types.ts";

export interface TranscriptCue {
  startSec: number;
  endSec: number;
  text: string;
}

/** null = no transcript for this book (an explicit UI state, not an error). */
export function loadTranscript(
  config: BookplayerConfig,
  book: BookRecord,
): Array<TranscriptCue> | null {
  const vttPath = assetPath(config, book, "vtt");
  if (!vttPath) return null;

  let text: string;
  try {
    text = readFileSync(vttPath, "utf8");
  } catch {
    return null;
  }

  const { value: classified, warnings } = parseVtt(text);
  if (warnings.length > 0) {
    console.warn(
      `[transcript] ${book.basename}: ${warnings.length} parse warnings (first: ${warnings[0]})`,
    );
  }
  // Compositions nest cues per segment; segment cue times are absolute in a
  // valid stitched VTT, so flattening preserves the timeline.
  const cues =
    classified.type === "composition"
      ? classified.value.segments.flatMap((segment) => segment.cues)
      : classified.value.cues;
  return cues.map((cue) => ({
    startSec: vttTimeToSeconds(cue.startTime),
    endSec: vttTimeToSeconds(cue.endTime),
    text: cue.text,
  }));
}
