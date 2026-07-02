import { join } from "node:path";

/**
 * Single source for align's paths and alignment parameters, mirroring
 * apps/transcribe/lib/config.ts and apps/epub-validate/src/config.ts (third
 * consumer for the future packages/config lift, BACKLOG promote-app-config).
 * Committed public fixtures anchor at REPO_ROOT; private outputs anchor at the
 * app directory. External private corpora are absolute paths pending a
 * CORPORA_DIR override.
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
  // Alignment parameters. Fixed baselines to evaluate, not eternal constants;
  // every result echoes them so runs are reproducible.
  passes: {
    // Pass 1: exact n-grams unique in both complete token streams.
    pass1NgramSize: 6,
    // Multipass proof: smaller exact n-grams, unique per residual gap.
    proofNgramSize: 4,
  },
  // Strict Unicode-aware Pass 1 normalization (design: NFKC, lowercase,
  // [^\p{L}\p{N}]+ boundaries). The id names the policy in result provenance.
  normalizationPolicy: "strict-nfkc-v1",
  extraction: {
    // Conservative baseline: linear="no" spine items are included; evaluation
    // compares an exclusion variant before any default change (recorded
    // configuration, since real spine metadata may be unreliable).
    includeNonLinearSpineItems: true,
    // Structurally unambiguous non-content excluded from text extraction.
    excludedElements: ["head", "script", "style"],
  },
  // Review-worklist thresholds. Anomalies flag spans/gaps/documents for manual
  // review; they never prove an anchor correct or remove content from metrics.
  metrics: {
    // Spine documents below this match ratio are flagged (zero-match always).
    lowMatchRatio: 0.1,
    // Rolling anchor density bucket, in narration minutes.
    densityBucketMinutes: 10,
    // Implied narration words-per-minute plausibility band across a gap.
    anomalyWpmMin: 80,
    anomalyWpmMax: 260,
    // EPUB/VTT token-count ratio band across a gap (checked above a floor).
    anomalyWordRatioMin: 0.5,
    anomalyWordRatioMax: 2,
    anomalyGapMinTokens: 20,
  },
};
