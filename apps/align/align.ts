// Entry point for sparse VTT–EPUB alignment (epoch 4): discover matched
// (vtt, epub, m4b) triplets per configured root, run the two-pass alignment,
// and write private reports (see docs/PRIVACY.md).
import process from "node:process";
import yargs from "yargs";
import {
  alignBook,
  buildAlignmentResult,
  type AlignOptions,
} from "@prosodio/align";
import { config } from "./lib/config.ts";
import {
  filterBySearch,
  scanRoot,
  type Exclusion,
  type RootScan,
  type Triplet,
} from "./lib/discovery.ts";
import {
  cleanReports,
  ensureReportsRepo,
  summarizeBook,
  writeBookReport,
  writeRunSummary,
  type RunSummary,
} from "./lib/report.ts";

export const APP_NAME = "align";

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Unknown error: ${String(error)}`;
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const argv = await yargs(process.argv.slice(2))
    .scriptName(APP_NAME)
    .option("search", {
      alias: "s",
      type: "string",
      describe:
        'Filter matched books (every word must match, case-insensitive), e.g. -s "culture banks"',
    })
    .option("root", {
      alias: "r",
      type: "string",
      choices: ["all", ...config.roots.map((r) => r.name)],
      default: "all",
      describe: "Scan one root or all",
    })
    .option("list", {
      type: "boolean",
      default: false,
      describe: "List matched triplets and exclusions without aligning",
    })
    .option("exclude-nonlinear", {
      type: "boolean",
      default: false,
      describe:
        'Exclude linear="no" spine items (baseline comparison; default includes them)',
    })
    .example('$0 --list -s "culture banks"', "show matching triplets")
    .example("$0 -r fixtures", "align the committed fixture triplet")
    .example("$0", "align every matched book in every root")
    .strict()
    .help()
    .parse();

  const roots = config.roots.filter(
    (r) => argv.root === "all" || r.name === argv.root,
  );
  const scans = roots.map((root) => scanRoot(root));
  const search = argv.search ?? "";

  for (const scan of scans) {
    printScan(scan, search);
  }
  if (argv.list) return;

  await runAlignments(scans, search, argv.root === "all", {
    includeNonLinearSpineItems: !argv.excludeNonlinear,
  });
}

async function runAlignments(
  scans: RootScan[],
  search: string,
  allRoots: boolean,
  options: AlignOptions,
): Promise<void> {
  ensureReportsRepo(config.reportsDir);
  // An unfiltered all-roots run is a full regeneration: drop stale reports,
  // preserve the nested .git. Filtered runs upsert only what they process.
  if (allRoots && search.trim().length === 0) {
    cleanReports(config.reportsDir);
  }

  const summary: RunSummary = {
    books: [],
    exclusions: scans.flatMap((scan) =>
      scan.exclusions.map((e) => ({
        root: e.root,
        kind: e.kind,
        base: e.base,
      })),
    ),
    search: search.trim().length > 0 ? search : null,
  };

  console.log("");
  for (const scan of scans) {
    for (const triplet of filterBySearch(scan.matched, search)) {
      const result = await alignTriplet(triplet, options);
      summary.books.push(result);
    }
  }
  const summaryPath = writeRunSummary(config.reportsDir, summary);
  console.log(`\nRun summary: ${summaryPath}`);
  console.log(`Books aligned: ${summary.books.length}`);
}

async function alignTriplet(
  triplet: Triplet,
  options: AlignOptions,
): Promise<ReturnType<typeof summarizeBook>> {
  const vttText = await Bun.file(triplet.vtt).text();
  const epubBytes = await Bun.file(triplet.epub).arrayBuffer();
  const alignment = await alignBook(vttText, epubBytes, options);
  const result = buildAlignmentResult(alignment, {
    root: triplet.root,
    base: triplet.base,
    vttPath: triplet.vtt,
    epubPath: triplet.epub,
    m4bPath: triplet.m4b,
  });
  const path = writeBookReport(config.reportsDir, result);
  const m = result.metrics;
  console.log(
    `  ${triplet.base}: spans=${result.spans.length} ` +
      `vtt=${(m.vttCoverage * 100).toFixed(1)}% epub=${(m.epubCoverage * 100).toFixed(1)}% ` +
      `anomalies=${m.anomalies.length} -> ${path}`,
  );
  return summarizeBook(result);
}

function printScan(scan: RootScan, search: string): void {
  const { root } = scan;
  console.log(`\n=== ${root.name} ===`);
  console.log(`  corpora:        ${root.corporaDir}`);
  console.log(`  transcriptions: ${root.transcriptionsDir}`);
  if (!scan.available) {
    console.log("  ! root not found (skipping)");
    return;
  }
  const matched = filterBySearch(scan.matched, search);
  const filtered = scan.matched.length - matched.length;
  console.log("");
  for (const triplet of matched) {
    console.log(`  + ${triplet.base}`);
  }
  for (const exclusion of scan.exclusions) {
    printExclusion(exclusion);
  }
  console.log("\n  -- summary --");
  console.log(`  matched:  ${matched.length}`);
  const counts = new Map<Exclusion["kind"], number>();
  for (const e of scan.exclusions) {
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  for (const [kind, count] of counts) {
    console.log(`  ${kind}: ${count}`);
  }
  if (filtered > 0) console.log(`  filtered: ${filtered}`);
}

function printExclusion(exclusion: Exclusion): void {
  switch (exclusion.kind) {
    case "no-m4b":
      console.log(`  x ${exclusion.base}`);
      console.log("    m4b:  (not found in corpora)");
      break;
    case "duplicate-m4b":
      console.log(`  x ${exclusion.base}`);
      console.log("    m4b:  ambiguous — multiple candidates:");
      for (const m4b of exclusion.m4bs) console.log(`      ${m4b}`);
      break;
    case "no-epub":
      console.log(`  ~ ${exclusion.base}`);
      console.log(`    m4b:  ${exclusion.m4b}`);
      console.log("    epub: (not found — basename mismatch or missing)");
      for (const epub of exclusion.siblingEpubs) {
        console.log(`      has: ${epub}`);
      }
      break;
  }
}
