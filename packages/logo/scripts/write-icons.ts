/**
 * Writes the icon files (`ICONS`, icons.ts) into a directory:
 *   bun scripts/write-icons.ts <output directory>
 * `bun run icons` writes Bookplayer's `public/`. Not part of `ci`: run it and
 * commit the files. Rasteriser choice: the README, "Icons".
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

import { ICONS, PNG_ICONS, renderTile } from "../index.ts";
import type { TileShape } from "../index.ts";
import { encodeIco } from "./ico.ts";

// ENTRY POINT
if (import.meta.main) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("error: missing output directory");
    console.error("usage: bun scripts/write-icons.ts <output directory>");
    process.exit(1);
  }
  await main(outDir);
}

// MAIN
async function main(outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const favicon = encodeIco(
    ICONS.favicon.sizes.map((size) => ({
      size,
      png: rasterise(size, ICONS.favicon.shape),
    })),
  );
  await write(outDir, ICONS.favicon.file, favicon);
  for (const { file, size, shape } of PNG_ICONS) {
    await write(outDir, file, rasterise(size, shape));
  }
}

/** The tile at exactly `size` px, as PNG (no downscaling). */
function rasterise(size: number, shape: TileShape): Uint8Array {
  return new Resvg(renderTile(size, shape)).render().asPng();
}

async function write(outDir: string, file: string, bytes: Uint8Array) {
  await Bun.write(join(outDir, file), bytes);
  console.log(`${file}: ${bytes.length} bytes`);
}
