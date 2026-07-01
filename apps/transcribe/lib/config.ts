import { join } from "node:path";

/**
 * Single source for transcribe's paths. The volatile data tree derives from one
 * DATA_DIR root so the data/<app>/<category> layout cannot drift; the committed
 * public fixtures tree hangs off REPO_ROOT instead. Both anchor three levels up
 * from lib/ (app -> apps -> repo root). A later step adds DATA_DIR / CORPORA_DIR
 * env overrides and promotes this to packages/config.
 */
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const DATA_DIR = join(REPO_ROOT, "data", "transcribe");

export const config = {
  dataDir: DATA_DIR,
  cacheDir: join(DATA_DIR, "cache"),
  workDir: join(DATA_DIR, "work"),
  outputDir: join(DATA_DIR, "output"),
  modelsDir: join(DATA_DIR, "models"),
  // Committed public test fixtures (scripts/fetch-and-check-fixtures.ts) — NOT
  // volatile data, so anchored at REPO_ROOT rather than DATA_DIR.
  fixturesDir: join(REPO_ROOT, "fixtures"),
};
