/**
 * Single source for bookplayer's roots, data dirs, and tuning — mirroring
 * apps/align/lib/config.ts (fourth consumer for the future packages/config
 * lift, BACKLOG promote-app-config).
 *
 * A root set joins a nested corpora dir (book folders holding .m4b + cover
 * (+ .epub)) to a flat transcriptions dir matched by .m4b basename. Exactly
 * one root is active per server run, selected by BOOKPLAYER_ROOT
 * (default "fixtures"); the private root's dirs can be overridden with
 * AUDIOBOOKS_ROOT and VTT_DIR. The selected root is validated at startup and
 * failures are fatal — an unmounted private volume must not look like an
 * empty library.
 */
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type RootName = "fixtures" | "private";

export interface RootSet {
  name: RootName;
  corporaDir: string;
  transcriptionsDir: string;
}

export interface BookplayerConfig {
  repoRoot: string;
  activeRoot: RootSet;
  /** Gitignored volatile state: data/bookplayer/… (docs/FILE-LAYOUT.md). */
  dataDir: string;
  cacheFile: string;
  evidenceDir: string;
  /** Bounded background ffprobe workers (plan: documented default 4). */
  ffprobeConcurrency: number;
}

// External private corpora live at an absolute path pending a CORPORA_DIR
// override, same compromise as align's config (BACKLOG promote-app-config).
const PRIVATE_CORPORA_DEFAULT = "/Volumes/Space/Reading/audiobooks";

export function resolveConfig(
  repoRoot: string,
  env: Record<string, string | undefined>,
): BookplayerConfig {
  const roots: ReadonlyArray<RootSet> = [
    {
      name: "fixtures",
      corporaDir: join(repoRoot, "fixtures", "audiobooks"),
      transcriptionsDir: join(repoRoot, "fixtures", "transcriptions"),
    },
    {
      name: "private",
      corporaDir: env.AUDIOBOOKS_ROOT?.trim() || PRIVATE_CORPORA_DEFAULT,
      transcriptionsDir:
        env.VTT_DIR?.trim() || join(repoRoot, "data", "transcribe", "output"),
    },
  ];

  const selection = env.BOOKPLAYER_ROOT?.trim() || "fixtures";
  const activeRoot = roots.find((r) => r.name === selection);
  if (!activeRoot) {
    throw new Error(
      `BOOKPLAYER_ROOT="${selection}" is not a known root; use "fixtures" or "private".`,
    );
  }

  requireDirectory(activeRoot, "corporaDir", activeRoot.corporaDir, env);
  requireDirectory(
    activeRoot,
    "transcriptionsDir",
    activeRoot.transcriptionsDir,
    env,
  );

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

function requireDirectory(
  root: RootSet,
  role: "corporaDir" | "transcriptionsDir",
  dir: string,
  env: Record<string, string | undefined>,
): void {
  const envVar =
    root.name === "private"
      ? role === "corporaDir"
        ? env.AUDIOBOOKS_ROOT?.trim()
          ? " (from AUDIOBOOKS_ROOT)"
          : " (default; override with AUDIOBOOKS_ROOT)"
        : env.VTT_DIR?.trim()
          ? " (from VTT_DIR)"
          : " (default; override with VTT_DIR)"
      : "";
  const describe = `${root.name} root ${role} "${dir}"${envVar}`;
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    throw new Error(`${describe} does not exist or is not readable.`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${describe} is not a directory.`);
  }
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
