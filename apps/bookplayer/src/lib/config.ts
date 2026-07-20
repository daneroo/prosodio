/**
 * Bookplayer's own data dirs and tuning, composed on top of the shared
 * named-root model in @prosodio/config (packages/config/roots.ts — root-set
 * shape, fixtures/private construction, selection + directory validation all
 * live there now; extracted here, BACKLOG promote-app-config lifts
 * transcribe/align/epub-validate onto the same package next).
 *
 * Exactly one root is active per server run, selected by BOOKPLAYER_ROOT
 * (default "fixtures"); the private root's dirs can be overridden with
 * AUDIOBOOKS_ROOT and VTT_DIR. The selected root is validated at startup and
 * failures are fatal — an unmounted private volume must not look like an
 * empty library.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveRoot } from "@prosodio/config";
import type { RootName, RootSet } from "@prosodio/config";

export type { RootName, RootSet };

export interface BookplayerConfig {
  repoRoot: string;
  activeRoot: RootSet;
  /** Gitignored volatile state: data/bookplayer/… (docs/file-layout.md). */
  dataDir: string;
  cacheFile: string;
  evidenceDir: string;
  /** Bounded background ffprobe workers (plan: documented default 4). */
  ffprobeConcurrency: number;
}

export function resolveConfig(
  repoRoot: string,
  env: Record<string, string | undefined>,
): BookplayerConfig {
  const selection = env.BOOKPLAYER_ROOT?.trim() || "fixtures";
  const activeRoot = resolveRoot(repoRoot, env, selection, "BOOKPLAYER_ROOT");

  const dataDir = join(repoRoot, "data", "bookplayer");
  return {
    repoRoot,
    activeRoot,
    dataDir,
    cacheFile: join(dataDir, "cache", "index.json"),
    evidenceDir: join(dataDir, "evidence"),
    ffprobeConcurrency: 4,
  };
}

/**
 * The repo root anchors committed fixtures and gitignored data/. Server
 * processes (dev, start) run from apps/bookplayer; root-run tooling runs
 * from the repo root — accept either, fail loudly elsewhere.
 */
export function findRepoRoot(cwd: string): string {
  for (const candidate of [cwd, resolve(cwd, "../..")]) {
    if (
      existsSync(join(candidate, "fixtures", "audiobooks")) &&
      existsSync(join(candidate, "package.json"))
    ) {
      return candidate;
    }
  }
  throw new Error(
    `Cannot locate the prosodio repo root from "${cwd}"; run from apps/bookplayer or the repo root.`,
  );
}

let cached: BookplayerConfig | null = null;

export function getConfig(): BookplayerConfig {
  cached ??= resolveConfig(findRepoRoot(process.cwd()), process.env);
  return cached;
}
