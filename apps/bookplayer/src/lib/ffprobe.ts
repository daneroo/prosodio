/**
 * ffprobe metadata extraction. Failures (missing binary, corrupt file,
 * timeout) resolve to nulls — enrichment must never take the library down.
 */
import { execFile } from "node:child_process";

export interface ProbeResult {
  durationSec: number | null;
  bitrateKbps: number | null;
  codec: string | null;
  /** m4b tags override basename parsing when present. */
  titleTag: string | null;
  artistTag: string | null;
}

export type ProbeFn = (filePath: string) => Promise<ProbeResult>;

const FFPROBE_TIMEOUT_MS = 10_000;

const EMPTY: ProbeResult = {
  durationSec: null,
  bitrateKbps: null,
  codec: null,
  titleTag: null,
  artistTag: null,
};

export function probeFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { timeout: FFPROBE_TIMEOUT_MS },
      (error, stdout) => {
        if (error) {
          resolve(EMPTY);
          return;
        }
        try {
          resolve(parseProbeOutput(JSON.parse(stdout)));
        } catch {
          resolve(EMPTY);
        }
      },
    );
  });
}

interface FfprobeJson {
  format?: {
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  streams?: Array<{ codec_type?: string; codec_name?: string }>;
}

function parseProbeOutput(data: FfprobeJson): ProbeResult {
  const format = data.format ?? {};
  const durationSec = format.duration
    ? Number.parseFloat(format.duration)
    : null;
  const bitrateKbps = format.bit_rate
    ? Math.round(Number.parseInt(format.bit_rate, 10) / 1000)
    : null;
  const audioStream = data.streams?.find((s) => s.codec_type === "audio");
  const tags = format.tags ?? {};
  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    bitrateKbps: Number.isFinite(bitrateKbps) ? bitrateKbps : null,
    codec: audioStream?.codec_name ?? null,
    titleTag: tags.title?.trim() || null,
    artistTag: (tags.artist ?? tags.album_artist)?.trim() || null,
  };
}
