/** Captures immutable Git revision and working-tree provenance for screenshot manifests. */

import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export async function gitCaptureBoundary(root, boundary, runGit = execFile) {
  const [{ stdout: revision }, { stdout: untracked }] = await Promise.all([
    runGit("git", ["rev-parse", "HEAD"], { cwd: root }),
    runGit("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root }),
  ]);
  let trackedDirty = false;
  try {
    await runGit("git", ["diff-index", "--quiet", "HEAD", "--"], { cwd: root });
  } catch (error) {
    if (error && typeof error === "object" && error.code === 1) trackedDirty = true;
    else throw error;
  }
  return {
    revision: revision.trim(),
    workingTree: trackedDirty || untracked.trim() ? "dirty" : "clean",
    boundary,
  };
}
