/** Defines shared TypeScript lint policy while allowing deliberate test and migration coercions. */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "pages-dist/**", "node_modules/**", "**/.build/**", "**/.venv/**"],
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
    // Tests and scripts may use `any` for mocking, type coercion, and migration helpers.
    files: ["tests/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["demo/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        history: "readonly",
        location: "readonly",
      },
    },
  },
);
