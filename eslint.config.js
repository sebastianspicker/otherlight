/** Defines shared TypeScript lint policy for the Browser and migration script. */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "pages-dist/**", "node_modules/**", "**/.build/**", "**/.venv/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Outside the domain, drafts reach EducationScenarioV4 only through
    // application/browserScenarioAdapter.ts (runtime ingress or side previews).
    files: ["apps/browser/src/{application,infrastructure,presentation,composition}/**/*.ts"],
    ignores: ["apps/browser/src/application/browserScenarioAdapter.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/domain/simulation/v4", "**/domain/simulation/v4/*"],
              importNames: ["mapBrowserScenarioDraftToEducationScenarioV4"],
              message: "Convert drafts through application/browserScenarioAdapter.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/demo/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        history: "readonly",
        location: "readonly",
      },
    },
  },
);
