/**
 * Runs the Browser Vitest suites when they are present. The suites and their
 * config are maintained outside the public tree, so a source release or a
 * fresh clone gets an explanation instead of a Vitest configuration error.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = path.join(repositoryRoot, "apps", "browser", "vitest.config.ts");

if (!existsSync(config)) {
  process.stderr.write(
    `${[
      "pnpm test: the Browser test suites are not part of this source tree.",
      "Otherlight's Vitest, pytest and Swift package suites are maintained privately;",
      "each release qualification records which local suite runs were made.",
      "The public gates are `pnpm contracts:check` and `pnpm ci:verify`.",
    ].join("\n")}\n`,
  );
  process.exit(1);
}

const [mode = "run", ...rest] = process.argv.slice(2);
const args = mode === "watch" ? ["--config", config, ...rest] : ["run", "--config", config, ...rest];
const result = spawnSync("vitest", args, { cwd: repositoryRoot, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
