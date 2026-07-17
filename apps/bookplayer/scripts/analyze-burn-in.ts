import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  analyzeBurnInPair,
  DEFAULT_RSS_THRESHOLD_BYTES,
} from "./burn-in-analysis.ts";

import type { BurnInEvent, MetricName } from "./burn-in-analysis.ts";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "rss-threshold-mib": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || positionals.length === 0) {
  console.log(`Usage: bun run analyze-burn-in -- <first.jsonl> <repeat.jsonl> [--rss-threshold-mib 16]

Asserts exact audio ranges, expected-only aborts, media diagnostics, warmed RSS,
and final-five memory trends. Exits nonzero on an acceptance failure.`);
  process.exit(values.help ? 0 : 2);
}

if (positionals.length !== 2) {
  throw new Error("expected first and repeat JSONL paths");
}

const thresholdBytes = values["rss-threshold-mib"]
  ? parseThreshold(values["rss-threshold-mib"])
  : DEFAULT_RSS_THRESHOLD_BYTES;
const firstPath = positionals[0] as string;
const repeatPath = positionals[1] as string;
const [firstEvents, repeatEvents] = await Promise.all([
  readJsonLines(firstPath),
  readJsonLines(repeatPath),
]);
const verdict = analyzeBurnInPair(firstEvents, repeatEvents, thresholdBytes);

console.log("# Bookplayer burn-in verdict\n");
console.log(`- First: ${firstPath}`);
console.log(`- Repeat: ${repeatPath}`);
console.log(
  `- RSS limit: ${formatBytes(verdict.rssThresholdBytes)}; warmed delta: ${formatOptionalBytes(verdict.warmedRssDeltaBytes)}`,
);
for (const label of ["first", "repeat"] as const) {
  console.log(`- ${label} memory:`);
  for (const metric of [
    "rssBytes",
    "heapUsedBytes",
    "externalBytes",
    "arrayBuffersBytes",
  ] satisfies Array<MetricName>) {
    const trend = verdict[label][metric];
    const resets =
      metric === "rssBytes"
        ? ""
        : `; meaningful resets ${trend.meaningfulResetCount} (threshold ${formatOptionalBytes(trend.meaningfulResetThresholdBytes)})`;
    console.log(
      `  - ${metric}: ${formatOptionalBytes(trend.baseline)} -> ${formatOptionalBytes(trend.end)}; delta ${formatSignedBytes(trend.delta)}; final-five slope ${formatSlope(trend.finalFiveSlope)}${trend.monotonicFinalFive ? " (monotonic)" : ""}${resets}`,
    );
  }
}

for (const mismatch of verdict.rangeMismatches) {
  console.log(`- Range mismatch: ${mismatch}`);
}
for (const failure of verdict.failures) console.log(`- Failure: ${failure}`);
console.log(`\n${verdict.passed ? "PASS" : "FAIL"}`);
if (!verdict.passed) process.exitCode = 1;

async function readJsonLines(path: string): Promise<Array<BurnInEvent>> {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line) as BurnInEvent;
      } catch (error) {
        throw new Error(`${path}:${index + 1}: invalid JSON`, { cause: error });
      }
    });
}

function parseThreshold(value: string) {
  const mib = Number(value);
  if (!Number.isFinite(mib) || mib < 0) {
    throw new Error("--rss-threshold-mib must be a non-negative number");
  }
  return mib * 1024 * 1024;
}

function formatOptionalBytes(value: number | null) {
  return value === null ? "unavailable" : formatBytes(value);
}

function formatSignedBytes(value: number | null) {
  if (value === null) return "unavailable";
  return `${value >= 0 ? "+" : "-"}${formatBytes(Math.abs(value))}`;
}

function formatSlope(value: number | null) {
  return value === null ? "unavailable" : `${formatSignedBytes(value)}/sample`;
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
