/** Allowlists the build-output directories that build scripts may delete and recreate. */

import { lstat } from "node:fs/promises";
import path from "node:path";

/** Repository-relative directories that only ever hold generated demo output. */
export const DISPOSABLE_DEMO_OUTPUTS = Object.freeze(["pages-dist", "dist/demo"]);

/**
 * Resolves `requested` against the repository root and returns it only when it
 * is exactly one of the allowlisted output directories; anything else throws
 * before a recursive delete can run.
 */
export function resolveDisposableOutput(repositoryRoot, requested, allowed = DISPOSABLE_DEMO_OUTPUTS) {
  const target = path.resolve(repositoryRoot, requested);
  const permitted = allowed.map((relative) => path.resolve(repositoryRoot, relative));
  if (!permitted.includes(target)) {
    throw new Error(
      `Refusing to replace ${target}: the output directory must be one of ${allowed.join(", ")} under ${repositoryRoot}.`,
    );
  }
  return target;
}

/**
 * Rejects a target reached through a symbolic link below the repository root,
 * so a linked `dist` cannot redirect the recursive delete outside the repository.
 * Missing segments are fine: the directory is created afterwards.
 */
export async function assertNoSymlinkBelowRoot(repositoryRoot, target) {
  const root = path.resolve(repositoryRoot);
  const segments = path.relative(root, path.resolve(target)).split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (stats.isSymbolicLink())
      throw new Error(`Refusing to replace ${target}: ${current} is a symbolic link.`);
  }
}
