//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...tanstackConfig,
  // tanstackConfig ships no React rules; hooks correctness matters here.
  // (The plugin's shipped configs are legacy-format under ESLint 10, so the
  // flat entry is spelled out.)
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    ignores: [
      "eslint.config.js",
      "src/routeTree.gen.ts",
      ".output/",
      ".nitro/",
      ".tanstack/",
    ],
  },
];
