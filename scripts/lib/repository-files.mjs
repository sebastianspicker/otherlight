/** Lists tracked and visible untracked repository files for the hygiene checks. */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Returns repository-relative paths from `git ls-files`, keeping only entries
 * that exist on disk so deleted-but-unstaged files never fail a scan.
 */
export function repositoryFiles(repoRoot) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .filter((path) => existsSync(resolve(repoRoot, path)));
}
