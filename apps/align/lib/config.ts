import { join } from "node:path";

/**
 * Single source for align-cli's paths and discovery roots, mirroring
 * apps/transcribe/lib/config.ts and apps/epub-validate/src/config.ts (third
 * consumer for the future packages/config lift, BACKLOG promote-app-config).
 * Algorithm parameters moved to @prosodio/align (packages/align/src/config.ts)
 * when the engine was extracted. Committed public fixtures anchor at
 * REPO_ROOT; private outputs anchor at the app directory. External private
 * corpora are absolute paths pending a CORPORA_DIR override.
 */
const APP_DIR = join(import.meta.dir, "..");
const REPO_ROOT = join(APP_DIR, "..", "..");

export type RootName = "fixtures" | "private";

/**
 * One discovery root set: a flat transcriptions dir joined by basename to a
 * nested corpora dir (reference: scripts/match-vtt.sh). The EPUB is the
 * matched m4b's same-basename sibling.
 */
export interface RootSet {
  name: RootName;
  transcriptionsDir: string;
  corporaDir: string;
}

const roots: readonly RootSet[] = [
  {
    name: "fixtures",
    transcriptionsDir: join(REPO_ROOT, "fixtures", "transcriptions"),
    corporaDir: join(REPO_ROOT, "fixtures", "audiobooks"),
  },
  {
    name: "private",
    transcriptionsDir: join(REPO_ROOT, "data", "transcribe", "output"),
    corporaDir: "/Volumes/Space/Reading/audiobooks",
  },
];

const ALICE = "Lewis Carroll - Alices Adventures in Wonderland";

export const config = {
  appDir: APP_DIR,
  // Private, gitignored, nested LOCAL-ONLY git repo (see docs/PRIVACY.md).
  // Everything under it derives from private corpora and is never committed.
  reportsDir: join(APP_DIR, "reports"),
  // Committed public test fixtures — NOT volatile data, anchored at REPO_ROOT.
  fixturesDir: join(REPO_ROOT, "fixtures"),
  // The committed end-to-end triplet. The m4b is gitignored/refetched and not
  // needed to align; tests feed the VTT + EPUB directly.
  aliceVtt: join(REPO_ROOT, "fixtures", "transcriptions", `${ALICE}.vtt`),
  aliceEpub: join(REPO_ROOT, "fixtures", "audiobooks", ALICE, `${ALICE}.epub`),
  aliceM4b: join(REPO_ROOT, "fixtures", "audiobooks", ALICE, `${ALICE}.m4b`),
  roots,
};
