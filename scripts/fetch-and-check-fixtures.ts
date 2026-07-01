#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

// Reconcile the public test fixtures. Desired state = fixtures/manifest.jsonc
// (files that must exist with a given sha256) plus two derived files; actual
// state = what is on disk. Each step converges the diff and is idempotent.

type Entry = { url: string; path: string; sha256: string };

const FIXTURES = join(import.meta.dir, "..", "fixtures");
const tty = process.stdout.isTTY;

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<void> {
  console.log("# Fetch and Check Fixtures\n");
  const manifest = await loadManifest();

  console.log("- fetch + verify (./fixtures/ vs manifest)\n");
  await reconcileManifest(manifest);

  console.log("\n- derive (ffmpeg)\n");
  await ensureDerived();

  console.log("\nfixtures OK");
}

async function loadManifest(): Promise<Entry[]> {
  // manifest is jsonc (JSON + comments); JSON5 parses that superset, whereas
  // Bun.file().json() is strict and would reject the comments.
  return Bun.JSON5.parse(
    await Bun.file(join(FIXTURES, "manifest.jsonc")).text(),
  ) as Entry[];
}

// Fetch-if-missing and verify are one unit: an entry is reconciled only when it
// is present AND its sha256 matches. A bad download is quarantined, not left in
// place, so a re-run refetches it.
async function reconcileManifest(manifest: Entry[]): Promise<void> {
  let ok = true;
  for (const entry of manifest) {
    if (!(await ensureEntry(entry))) ok = false;
  }
  if (!ok) die("fixture verification failed");
}

async function ensureEntry({
  url,
  path,
  sha256: want,
}: Entry): Promise<boolean> {
  const target = join(FIXTURES, path);
  const fresh = !existsSync(target);
  if (fresh) {
    console.log(`  ${dim("↓")} ${path}`);
    await mkdir(dirname(target), { recursive: true });
    // curl (not fetch+Bun.write, which stalls on large streams): -f fails on
    // HTTP errors, -L follows archive.org/Gutenberg redirects, --retry retries.
    await $`curl -fL --retry 3 -o ${target} ${url}`;
  }

  const got = await sha256(target);
  if (got === want) {
    console.log(`  ${green("✓")} ${path} ${dim(`: ${want.slice(0, 16)}…`)}`);
    return true;
  }

  const detail = `got ${got.slice(0, 16)}… want ${want.slice(0, 16)}…`;
  console.log(`  ${red("✗")} ${path} ${dim(`: ${detail}`)}`);
  if (fresh) {
    const bad = quarantinePath(target);
    await rename(target, bad);
    console.log(`    ${dim(`quarantined -> ${basename(bad)}`)}`);
  }
  return false;
}

// Desired: the two derived fixtures exist (alice-30m ~1800s). Actual: existsSync.
// Reconcile: produce with ffmpeg. Not digest-pinned — encoders aren't
// bit-reproducible, so alice-30m is duration-checked instead.
async function ensureDerived(): Promise<void> {
  const audio = (name: string) => join(FIXTURES, "audio", name);
  const aliceFull = join(
    FIXTURES,
    "audiobooks/Lewis Carroll - Alices Adventures in Wonderland",
    "Lewis Carroll - Alices Adventures in Wonderland.m4b",
  );

  await produce(audio("jfk.m4b"), "jfk.m4b <- jfk.mp3", async (out) => {
    await $`ffmpeg -nostdin -loglevel error -y -i ${audio("jfk.mp3")} -c:a aac -b:a 64k ${out}`;
  });

  await produce(
    audio("alice-30m.m4b"),
    "alice-30m.m4b <- full Alice",
    async (out) => {
      await $`ffmpeg -nostdin -loglevel error -y -i ${aliceFull} -t 1800 -c copy ${out}`;
      const secs = await durationSec(out);
      if (!(secs >= 1500 && secs <= 1900)) {
        die(`alice-30m.m4b duration ${secs}s outside expected ~1800s`);
      }
    },
  );
}

async function produce(
  target: string,
  label: string,
  build: (out: string) => Promise<void>,
): Promise<void> {
  if (existsSync(target)) {
    console.log(`  ${green("✓")} ${label} ${dim(": exists")}`);
    return;
  }
  console.log(`  ${dim("⚙")} ${label}`);
  await build(target);
}

function quarantinePath(target: string): string {
  const ext = extname(target);
  return join(dirname(target), `${basename(target, ext)}-mismatch${ext}`);
}

async function sha256(path: string): Promise<string> {
  return new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).bytes())
    .digest("hex");
}

async function durationSec(path: string): Promise<number> {
  const out =
    await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${path}`.text();
  return Number(out.trim());
}

function die(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function paint(code: string, s: string): string {
  return tty ? `\x1b[${code}m${s}\x1b[0m` : s;
}
function green(s: string): string {
  return paint("32", s);
}
function red(s: string): string {
  return paint("31", s);
}
function dim(s: string): string {
  return paint("2", s);
}
