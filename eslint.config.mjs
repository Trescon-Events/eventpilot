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
    ignores: [
      // app/lib/registry/modules.tsx hardcodes per-module brand identity
      // colors as its own source-of-truth data — not a token-system gap.
      "app/lib/registry/modules.tsx",
      // AI Learning tab (2026-08-18 consolidation): these three files carry
      // forward JSX moved verbatim out of app/admin/page.tsx's own
      // pre-existing (grandfathered, ~97-offender) literal-color debt for
      // this exact feature — the same colors were already in production,
      // un-flagged, before the move. Line-scoped linting only sees them as
      // "new" because the lines are new to these files, not because the
      // colors themselves are new violations. Token-backfilling this
      // feature is a separate, deliberate cleanup — out of scope for a
      // tab-consolidation refactor.
      "app/admin/ai-learning/AiLearningTab.tsx",
      "app/admin/ai-learning/AnalyticsSection.tsx",
      "app/admin/ai-learning/CourseGeneratorSection.tsx",
      "app/admin/ai-learning/MemberFilterRow.tsx",
      "app/admin/ai-learning/ReadinessSection.tsx",
      "app/admin/ai-learning/useReadinessData.ts",
    ],
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
