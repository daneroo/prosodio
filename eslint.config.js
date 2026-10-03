import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // data/ is gitignored scratch (outputs, upstream clones); prettier and
    // markdownlint already skip gitignored paths, ESLint does not.
    ignores: [
      "node_modules/",
      "dist/",
      "**/dist/",
      "out/",
      ".agents/",
      "data/",
    ],
  },
);
