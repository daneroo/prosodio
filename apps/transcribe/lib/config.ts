import { join } from "node:path";

/**
 * Single source for transcribe's data locations, all derived from one DATA_DIR
 * root so the data/<app>/<category> layout cannot drift. DATA_DIR is the
 * top-level data/transcribe (FILE-LAYOUT conformant). A later step adds
 * DATA_DIR / CORPORA_DIR env overrides and promotes this to packages/config.
 */
const DATA_DIR = join(import.meta.dir, "..", "..", "..", "data", "transcribe");

export const config = {
  dataDir: DATA_DIR,
  cacheDir: join(DATA_DIR, "cache"),
  workDir: join(DATA_DIR, "work"),
  outputDir: join(DATA_DIR, "output"),
  modelsDir: join(DATA_DIR, "models"),
  // Under DATA_DIR with the rest for now. Samples are public-reconstructible
  // input (not volatile data); their eventual home is fixtures/ or external
  // corpora — likely to MOVE or be DEPRECATED, but not today.
  sampleDir: join(DATA_DIR, "samples"),
};
