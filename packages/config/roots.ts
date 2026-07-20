/**
 * Named-root model shared by prosodio apps: a root set joins a nested corpora
 * dir (book folders holding .m4b + cover (+ .epub)) to a flat transcriptions
 * dir matched by .m4b basename. Two roots exist — "fixtures" (committed,
 * anchored at the repo root) and "private" (an external corpus, overridable
 * via env). PURE: repoRoot and env are inputs, never read from process.env
 * here — callers own their own env var names for selection (see
 * resolveRoot's selectionEnvVar) and process.env itself.
 *
 * Extracted from apps/bookplayer/src/lib/config.ts (BACKLOG
 * promote-app-config lifts transcribe/align/epub-validate onto this same
 * surface later; they are untouched by this step).
 */
import { statSync } from "node:fs";
import { join } from "node:path";

export type RootName = "fixtures" | "private";

export interface RootSet {
  name: RootName;
  corporaDir: string;
  transcriptionsDir: string;
}

// External private corpora live at an absolute path pending a CORPORA_DIR
// override (BACKLOG promote-app-config).
const PRIVATE_CORPORA_DEFAULT = "/Volumes/Space/Reading/audiobooks";

/**
 * Builds both named roots for a repo checkout. Does not select or validate —
 * see resolveRoot.
 */
export function resolveRoots(
  repoRoot: string,
  env: Record<string, string | undefined>,
): ReadonlyArray<RootSet> {
  return [
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
}

/**
 * Selects a root by name and validates both its directories exist, failing
 * loudly otherwise (an unmounted private volume must not look like an empty
 * library). `selectionEnvVar` names the caller's own selection variable (e.g.
 * "BOOKPLAYER_ROOT") purely for the unknown-name error message — this package
 * has no opinion on how callers choose `name`.
 */
export function resolveRoot(
  repoRoot: string,
  env: Record<string, string | undefined>,
  name: string,
  selectionEnvVar: string,
): RootSet {
  const roots = resolveRoots(repoRoot, env);
  const activeRoot = roots.find((r) => r.name === name);
  if (!activeRoot) {
    throw new Error(
      `${selectionEnvVar}="${name}" is not a known root; use "fixtures" or "private".`,
    );
  }

  requireDirectory(activeRoot, "corporaDir", activeRoot.corporaDir, env);
  requireDirectory(
    activeRoot,
    "transcriptionsDir",
    activeRoot.transcriptionsDir,
    env,
  );

  return activeRoot;
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
