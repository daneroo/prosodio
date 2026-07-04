import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanRoot } from "./scan.ts";
import { loadTranscript } from "./transcript.ts";
import type { BookplayerConfig } from "./config.ts";

const tempDirs: Array<string> = [];

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.500
This is Audible.

00:00:02.500 --> 01:00:16.000
Use of weapons.
`;

function makeConfig(): BookplayerConfig {
  const base = mkdtempSync(join(tmpdir(), "bookplayer-transcript-"));
  tempDirs.push(base);
  const corporaDir = join(base, "audiobooks");
  const transcriptionsDir = join(base, "transcriptions");
  mkdirSync(corporaDir, { recursive: true });
  mkdirSync(transcriptionsDir, { recursive: true });
  return {
    repoRoot: base,
    activeRoot: { name: "fixtures", corporaDir, transcriptionsDir },
    dataDir: join(base, "data"),
    cacheFile: join(base, "data", "cache", "index.json"),
    evidenceDir: join(base, "data", "evidence"),
    ffprobeConcurrency: 2,
  };
}

function addBook(
  config: BookplayerConfig,
  base: string,
  vtt: string | null,
): void {
  const dir = join(config.activeRoot.corporaDir, base);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${base}.m4b`), "");
  writeFileSync(join(dir, "cover.jpg"), "");
  if (vtt !== null) {
    writeFileSync(
      join(config.activeRoot.transcriptionsDir, `${base}.vtt`),
      vtt,
    );
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadTranscript", () => {
  test("maps @prosodio/vtt cues to lean second-based cues", () => {
    const config = makeConfig();
    addBook(config, "Book One", VTT);
    const [book] = scanRoot(config.activeRoot).books;

    const cues = loadTranscript(config, book);
    expect(cues).toEqual([
      { startSec: 0, endSec: 2.5, text: "This is Audible." },
      { startSec: 2.5, endSec: 3616, text: "Use of weapons." },
    ]);
  });

  test("no matched VTT yields null — the explicit no-transcript state", () => {
    const config = makeConfig();
    addBook(config, "Book One", null);
    const [book] = scanRoot(config.activeRoot).books;

    expect(loadTranscript(config, book)).toBeNull();
  });
});
