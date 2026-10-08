import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ICONS, LOGO_NAME, PNG_ICONS } from "@prosodio/logo";

const publicDir = join(import.meta.dir, "..", "public");
const manifest = await Bun.file(join(publicDir, "manifest.webmanifest")).json();

describe("manifest.webmanifest", () => {
  test("names the app as the logo does", () => {
    expect(manifest.name).toBe(LOGO_NAME);
    expect(manifest.short_name).toBe(LOGO_NAME);
  });

  test("lists exactly the manifest icons", () => {
    const listed = manifest.icons.map(
      (icon: { src: string; sizes: string }) => [icon.src, icon.sizes],
    );
    expect(listed).toEqual(
      ICONS.manifest.map(({ file, size }) => [`/${file}`, `${size}x${size}`]),
    );
  });

  test("every icon file exists in public/", () => {
    const files = [ICONS.favicon.file, ...PNG_ICONS.map(({ file }) => file)];
    for (const file of files) {
      expect(existsSync(join(publicDir, file))).toBe(true);
    }
  });
});
