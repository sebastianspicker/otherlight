/** Checks the repository's production-source physical-line ceiling. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  EXCLUDED_DIRECTORY_NAMES,
  MAX_PHYSICAL_LINES,
  SOURCE_EXTENSIONS,
  SOURCE_ROOTS,
} from "./source-line-limits.config.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function countPhysicalLines(source) {
  if (source.length === 0) return 0;
  return source.split(/\r\n|\r|\n/).length - Number(/(?:\r\n|\r|\n)$/.test(source));
}

export function exceedsLineLimit(source) {
  return countPhysicalLines(source) > MAX_PHYSICAL_LINES;
}

export function isProductionSource(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const segments = normalizedPath.split("/");
  return (
    SOURCE_EXTENSIONS.has(path.extname(normalizedPath)) &&
    !segments.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment))
  );
}

async function collectSourceFiles(directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(rootDirectory, absolutePath);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name)) await collectSourceFiles(absolutePath, files);
      continue;
    }
    if (entry.isFile() && isProductionSource(relativePath)) files.push(absolutePath);
  }
}

export async function findLineLimitViolations(root = rootDirectory, sourceRoots = SOURCE_ROOTS) {
  const files = [];
  for (const sourceRoot of sourceRoots) await collectSourceFiles(path.join(root, sourceRoot), files);
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const lineCount = countPhysicalLines(source);
    if (exceedsLineLimit(source)) {
      violations.push({ file: path.relative(root, file).split(path.sep).join("/"), lineCount });
    }
  }
  return violations;
}

async function main() {
  const violations = await findLineLimitViolations();
  if (violations.length === 0) {
    process.stdout.write(`All production source files are at most ${MAX_PHYSICAL_LINES} physical lines.\n`);
    return;
  }
  for (const violation of violations)
    process.stderr.write(
      `${violation.file}: ${violation.lineCount} physical lines (maximum ${MAX_PHYSICAL_LINES})\n`,
    );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
