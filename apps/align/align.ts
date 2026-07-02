// Entry point for sparse VTT–EPUB alignment (epoch 4). Grows with the plan:
// discovery/matching -> contracts -> Pass 1 -> multipass proof.
import process from "node:process";
import yargs from "yargs";
import { config } from "./lib/config.ts";
import {
  filterBySearch,
  scanRoot,
  type Exclusion,
  type RootScan,
} from "./lib/discovery.ts";

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
    .example('$0 --list -s "culture banks"', "show matching triplets")
    .example("$0 -r fixtures --list", "show the committed fixture triplet")
    .strict()
    .help()
    .parse();

  const roots = config.roots.filter(
    (r) => argv.root === "all" || r.name === argv.root,
  );
  for (const root of roots) {
    const scan = scanRoot(root);
    printScan(scan, argv.search ?? "");
  }
  if (!argv.list) {
    console.log(
      "\nAlignment is not implemented yet (epoch 4 in progress); output above is the --list view.",
    );
  }
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
