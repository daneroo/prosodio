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
  // Asset endpoints are nitro handlers (see server/handlers/) so that
  // media-element requests (Sec-Fetch-Dest image/audio) reach them in dev.
  nitro: {
    preset: "bun",
    rollupConfig: { external: [/^@sentry\//] },
    handlers: [
      {
        route: "/api/alignment/:bookId",
        handler: "./server/handlers/alignment.ts",
      },
      { route: "/api/audio/:bookId", handler: "./server/handlers/audio.ts" },
      { route: "/api/cover/:bookId", handler: "./server/handlers/cover.ts" },
      { route: "/api/epub/:bookId", handler: "./server/handlers/epub.ts" },
      { route: "/api/vtt/:bookId", handler: "./server/handlers/vtt.ts" },
    ],
  },
  plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
