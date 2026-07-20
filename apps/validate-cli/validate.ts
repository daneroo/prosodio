// Entry point for the standalone validation CLI (validate-bootstrap D4): a
// thin skin over @prosodio/corpus + @prosodio/config. All logic lives in
// lib/cli.ts (parse -> plan; run; render) — this file only wires
// process.argv/env/exit around it, mirroring apps/align/align.ts.
import process from "node:process";
import { join } from "node:path";
import {
  HintsUsageError,
  recordMtimes,
  renderHuman,
  renderJson,
  renderRecordMtimes,
  resolvePlan,
  runValidation,
} from "./lib/cli.ts";

const APP_DIR = import.meta.dir;
const REPO_ROOT = join(APP_DIR, "..", "..");

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    if (error instanceof HintsUsageError) {
      // Same usage/config family as resolvePlan's exit 2 — only knowable
      // once the hints file is actually read, so it can't be caught there.
      console.error(`Error: ${error.message}`);
      process.exit(2);
    }
    const message =
      error instanceof Error
        ? error.message
        : `Unknown error: ${String(error)}`;
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const plan = resolvePlan(process.argv.slice(2), REPO_ROOT, process.env);
  if (plan.kind === "usage") {
    console.error(plan.message);
    process.exit(2);
  }

  if (plan.kind === "record-mtimes") {
    const result = await recordMtimes(plan.corpusRoot, plan.hintsPath);
    console.log(renderRecordMtimes(result));
    process.exit(0);
  }

  const result = await runValidation(plan.corpusRoot, {
    probe: plan.probe,
    hintsPath: plan.hintsPath,
  });
  console.log(plan.json ? renderJson(result) : renderHuman(result));
  process.exit(result.pass ? 0 : 1);
}
