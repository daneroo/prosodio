import { Glob } from "bun";
import { existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { RootName, RootSet } from "./config.ts";

/**
 * Triplet discovery (reference: scripts/match-vtt.sh). A root set joins a flat
 * transcriptions dir to a nested corpora dir by basename: each .vtt pairs with
 * the .m4b of the same basename, and the EPUB is that m4b's same-basename
 * sibling. Unmatched, duplicate, and ambiguous candidates are reported, never
 * guessed. The pure matcher operates on file lists so tests need no corpus.
 */

export interface Triplet {
  root: RootName;
  base: string;
  vtt: string;
  m4b: string;
  epub: string;
  /** m4b path relative to the root's corpora dir — the `-s` search key. */
  relPath: string;
}

export type Exclusion =
  | { kind: "no-m4b"; root: RootName; base: string; vtt: string }
  | {
      kind: "duplicate-m4b";
      root: RootName;
      base: string;
      vtt: string;
      m4bs: string[];
    }
  | {
      kind: "no-epub";
      root: RootName;
      base: string;
      vtt: string;
      m4b: string;
      siblingEpubs: string[];
    };

export interface RootScan {
  root: RootSet;
  /** false when either directory is missing (private corpus not mounted). */
  available: boolean;
  matched: Triplet[];
  exclusions: Exclusion[];
}

export interface RootFiles {
  vtts: string[];
  m4bs: string[];
  epubs: string[];
}

export function matchRoot(root: RootSet, files: RootFiles): RootScan {
  const m4bsByBase = new Map<string, string[]>();
  for (const m4b of [...files.m4bs].sort()) {
    const base = basename(m4b, ".m4b");
    m4bsByBase.set(base, [...(m4bsByBase.get(base) ?? []), m4b]);
  }
  const epubSet = new Set(files.epubs);
  const epubsByDir = new Map<string, string[]>();
  for (const epub of [...files.epubs].sort()) {
    const dir = dirname(epub);
    epubsByDir.set(dir, [...(epubsByDir.get(dir) ?? []), epub]);
  }

  const matched: Triplet[] = [];
  const exclusions: Exclusion[] = [];
  for (const vtt of [...files.vtts].sort()) {
    const base = basename(vtt, ".vtt");
    const m4bs = m4bsByBase.get(base);
    if (!m4bs) {
      exclusions.push({ kind: "no-m4b", root: root.name, base, vtt });
      continue;
    }
    if (m4bs.length > 1) {
      exclusions.push({
        kind: "duplicate-m4b",
        root: root.name,
        base,
        vtt,
        m4bs,
      });
      continue;
    }
    const m4b = m4bs[0]!;
    const epub = join(dirname(m4b), `${base}.epub`);
    if (!epubSet.has(epub)) {
      exclusions.push({
        kind: "no-epub",
        root: root.name,
        base,
        vtt,
        m4b,
        siblingEpubs: epubsByDir.get(dirname(m4b)) ?? [],
      });
      continue;
    }
    matched.push({
      root: root.name,
      base,
      vtt,
      m4b,
      epub,
      relPath: relative(root.corporaDir, m4b),
    });
  }
  return { root, available: true, matched, exclusions };
}

/**
 * Case-insensitive AND filter: every whitespace-delimited term must occur in
 * the triplet's corpus-relative path (which ends in the basename). Filters the
 * already-matched set only — pairing never changes.
 */
export function filterBySearch(triplets: Triplet[], search: string): Triplet[] {
  const terms = search
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return triplets;
  return triplets.filter((t) => {
    const key = t.relPath.toLowerCase();
    return terms.every((term) => key.includes(term));
  });
}

export function scanRoot(root: RootSet): RootScan {
  if (!existsSync(root.transcriptionsDir) || !existsSync(root.corporaDir)) {
    return { root, available: false, matched: [], exclusions: [] };
  }
  const list = (glob: string, cwd: string): string[] =>
    [...new Glob(glob).scanSync({ cwd, absolute: true })].sort();
  return matchRoot(root, {
    vtts: list("*.vtt", root.transcriptionsDir),
    m4bs: list("**/*.m4b", root.corporaDir),
    epubs: list("**/*.epub", root.corporaDir),
  });
}
