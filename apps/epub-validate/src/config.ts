import { homedir } from "node:os";
import { join } from "node:path";

export type RootName = "test" | "drop" | "space";

export interface RootConfig {
  name: RootName;
  path: string;
}

/**
 * Single source for epub-validate's paths, mirroring
 * apps/transcribe/lib/config.ts — the second consumer for the future
 * packages/config lift (BACKLOG promote-app-config). Committed public fixtures
 * anchor at REPO_ROOT; app-local outputs (built browser bundle, the private
 * nested reports repo) anchor at the app directory. External private corpora
 * roots are absolute paths pending a CORPORA_DIR override.
 */
const APP_DIR = join(import.meta.dir, "..");
const REPO_ROOT = join(APP_DIR, "..", "..");

const roots: readonly RootConfig[] = [
  { name: "test", path: join(REPO_ROOT, "fixtures", "epub") },
  { name: "space", path: "/Volumes/Space/Reading/audiobooks" },
  {
    name: "drop",
    path: join(homedir(), "Library/CloudStorage/Dropbox/A-Reading/EBook"),
  },
];

export const config = {
  appDir: APP_DIR,
  browserBundlePath: join(APP_DIR, "dist", "epubts-browser.js"),
  // Private, gitignored, nested LOCAL-ONLY git repo (see docs/PRIVACY.md).
  reportsDir: join(APP_DIR, "reports"),
  // Committed public test fixtures — NOT volatile data, anchored at REPO_ROOT.
  fixturesDir: join(REPO_ROOT, "fixtures"),
  epubFixturesDir: join(REPO_ROOT, "fixtures", "epub"),
  // Crafted synthetic fixtures local to this app's tests.
  appTestFixturesDir: join(APP_DIR, "test", "fixtures"),
  roots,
};
