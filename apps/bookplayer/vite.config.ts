import { defineConfig } from "vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Bun preset per https://bun.com/docs/guides/ecosystem/tanstack-start.
  // The installed nitro nightly's plugin-arg type only admits its own two
  // fields; the vite UserConfig.nitro augmentation is its config path.
  // The sentry external is scaffold-provided nitro build hygiene.
  nitro: { preset: "bun", rollupConfig: { external: [/^@sentry\//] } },
  plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
