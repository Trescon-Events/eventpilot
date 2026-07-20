import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // tools/smartexcel is its own TanStack Start project with its own eslint config.
    "tools/smartexcel/**",
  ]),
  // Push new/changed code toward var(--token) (app/globals.css) or
  // app/components/ui instead of raw color literals. Enforced in practice
  // via `npm run lint:changed` (scripts/lint-changed.mjs), which is the
  // only lint invocation the CI gate runs — so this only hard-fails on
  // files a push/PR actually touches, not the ~97 pre-existing offenders
  // repo-wide. `npm run lint` (unscoped) will still flag all of them for
  // anyone who runs it locally.
  {
    files: ["app/**/*.{ts,tsx}"],
    // app/lib/registry/modules.tsx hardcodes per-module brand identity
    // colors as its own source-of-truth data — not a token-system gap.
    ignores: ["app/lib/registry/modules.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message: "Raw hex color literal — use var(--token) (app/globals.css) or a component from app/components/ui instead.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
          message: "Raw hex color literal in a template string — use var(--token) or app/components/ui instead.",
        },
        {
          selector: "Literal[value=/rgba?\\(\\s*\\d/]",
          message: "Raw rgb()/rgba() color literal — use var(--token) or app/components/ui instead.",
        },
      ],
    },
  },
]);

export default eslintConfig;
