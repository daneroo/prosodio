import { join } from "node:path";

/**
 * Repo-root-anchored paths to the committed Alice fixture triplet, for this
 * package's own tests only (the engine takes explicit paths; it never
 * discovers). Consumers own their roots/paths configs.
 */
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const ALICE = "Lewis Carroll - Alices Adventures in Wonderland";

export const fixturePaths = {
  aliceVtt: join(REPO_ROOT, "fixtures", "transcriptions", `${ALICE}.vtt`),
  aliceEpub: join(REPO_ROOT, "fixtures", "audiobooks", ALICE, `${ALICE}.epub`),
};
