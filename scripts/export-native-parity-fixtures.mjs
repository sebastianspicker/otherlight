/**
 * Exports TypeScript-oracle parity fixtures with a dirty-aware source revision
 * so the native client never presents stale numerical evidence as current.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const revision = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

if (revision.status !== 0) process.exit(revision.status ?? 1);

const oraclePaths = [
  "src",
  "tests/baseline/native-parity-fixtures.test.ts",
  "scripts/export-native-parity-fixtures.mjs",
];
const trackedChanges = spawnSync("git", ["diff", "--quiet", "HEAD", "--", ...oraclePaths], {
  cwd: root,
  stdio: "ignore",
});
if (trackedChanges.status !== 0 && trackedChanges.status !== 1) {
  process.exit(trackedChanges.status ?? 1);
}
const untrackedChanges = spawnSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", ...oraclePaths],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
if (untrackedChanges.status !== 0) process.exit(untrackedChanges.status ?? 1);

const oracleIsDirty = trackedChanges.status !== 0 || untrackedChanges.stdout.trim().length > 0;
const sourceRevision = `${revision.stdout.trim()}${oracleIsDirty ? "+dirty" : ""}`;

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "tests/baseline/native-parity-fixtures.test.ts", "--reporter=dot"],
  {
    cwd: root,
    env: {
      ...process.env,
      NATIVE_PARITY_WRITE: "1",
      NATIVE_PARITY_SOURCE_REVISION: sourceRevision,
    },
    stdio: "inherit",
  },
);

if (result.status !== 0) process.exit(result.status ?? 1);

const formatted = spawnSync(
  "pnpm",
  ["exec", "prettier", "--write", "contracts/education-v4/fixtures/scoped-parity.json"],
  { cwd: root, stdio: "inherit" },
);

process.exit(formatted.status ?? 1);
