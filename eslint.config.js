/** Defines shared TypeScript lint policy while allowing deliberate test and migration coercions. */
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
    // Tests and scripts may use `any` for mocking, type coercion, and migration helpers.
    files: ["apps/browser/tests/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
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
