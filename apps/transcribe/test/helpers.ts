/**
 * Shared test utilities for whisper integration tests.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { config } from "../lib/config.ts";

// Common paths
export const TEST_WORK_DIR_ROOT = config.workDir;

// Committed public fixtures (scripts/fetch-and-check-fixtures.ts).
export const FIXTURE_JFK = join(config.fixturesDir, "audio", "jfk.m4b");

/**
 * Track work directories for cleanup in afterAll.
 * Usage:
 *   const cleanup = createWorkDirCleanup();
 *   // In test: cleanup.track(runWorkDir);
 *   // In afterAll: await cleanup.run();
 */
export function createWorkDirCleanup() {
  const dirs: string[] = [];

  return {
    track(dir: string) {
      dirs.push(dir);
    },
    async run() {
      for (const dir of dirs) {
        if (existsSync(dir)) {
          await rm(dir, { recursive: true });
        }
      }
    },
  };
}

/**
 * Clean up an output directory (rm + mkdir).
 */
export async function resetOutputDir(dir: string) {
  const { mkdir } = await import("node:fs/promises");
  if (existsSync(dir)) {
    await rm(dir, { recursive: true });
  }
  await mkdir(dir, { recursive: true });
}

/**
 * Clean up an output directory if it exists.
 */
export async function cleanupOutputDir(dir: string) {
  if (existsSync(dir)) {
    await rm(dir, { recursive: true });
  }
}

/**
 * Warm up whisper-cli to ensure Metal shaders are compiled.
 * This prevents tests from timing out on their first run.
 */
export function warmupWhisperCli() {
  try {
    // Run --help which is fast but still triggers ggml_metal_library_init
    execSync("whisper-cli --help", { stdio: "ignore" });
  } catch {
    // Ignore errors if whisper-cli is missing; tests will fail properly later
  }
}
