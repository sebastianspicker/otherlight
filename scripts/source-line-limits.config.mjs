/** Defines the deterministic production-source physical-line policy. */
export const MAX_PHYSICAL_LINES = 500;

export const SOURCE_ROOTS = [
  "apps/browser/src",
  "apps/demo",
  "scripts",
  "services/science/science_backend",
  "apps/apple/App",
  "apps/apple/MacApp",
  "apps/apple/Packages/OtherlightCore/Sources",
  "apps/apple/Packages/OtherlightScience/Sources",
];

export const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".py", ".swift", ".css", ".sh"]);

export const EXCLUDED_DIRECTORY_NAMES = new Set([
  "test",
  "tests",
  "__tests__",
  "generated",
  "vendor",
  "contracts",
  "schema",
  "schemas",
  "data",
  "fixtures",
  "node_modules",
  "dist",
  "pages-dist",
  "coverage",
  "test-results",
  ".science-cache",
  ".venv",
  ".build",
  ".swiftpm",
  "DerivedData",
]);
