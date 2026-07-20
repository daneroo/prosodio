// Entry point for the standalone validation CLI (validate-bootstrap D4): a
// thin skin over @prosodio/corpus + @prosodio/config. All logic lives in
// lib/cli.ts (parse -> plan; run; render) — this file only wires
// process.argv/env/exit around it, mirroring apps/align/align.ts.
import process from "node:process";
import { join } from "node:path";
import {
  renderHuman,
  renderJson,
  resolvePlan,
  runValidation,
} from "./lib/cli.ts";

const APP_DIR = import.meta.dir;
const REPO_ROOT = join(APP_DIR, "..", "..");

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
  const plan = resolvePlan(process.argv.slice(2), REPO_ROOT, process.env);
  if (plan.kind === "usage") {
    console.error(plan.message);
    process.exit(2);
  }

  const result = await runValidation(plan.corpusRoot, { probe: plan.probe });
  console.log(plan.json ? renderJson(result) : renderHuman(result));
  process.exit(result.pass ? 0 : 1);
}
