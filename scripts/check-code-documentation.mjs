/**
 * Verifies that every authored executable module states its responsibility
 * before implementation details, keeping the documentation standard durable.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootExecutableFiles = new Set(["eslint.config.js"]);
const executableExtensions = new Set([".css", ".html", ".js", ".mjs", ".py", ".sh", ".swift", ".ts"]);

function candidatePaths() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .filter((path) => existsSync(resolve(repoRoot, path)));
}

function isAuthoredExecutable(path) {
  if (rootExecutableFiles.has(path)) return true;
  const extension = extname(path);
  if (!executableExtensions.has(extension)) return false;
  if (path.startsWith("apps/browser/src/")) return extension === ".css" || extension === ".ts";
  if (path.startsWith("apps/browser/tests/")) return extension === ".ts";
  return (
    path.startsWith("scripts/") || path.startsWith("services/science/") || path.startsWith("apps/apple/")
  );
}

function skipBlockDirective(lines, index) {
  while (index < lines.length && !lines[index].includes("*/")) index += 1;
  return index + 1;
}

function skipRequiredFileHeader(path, lines, index) {
  if (lines[index]?.startsWith("#!")) index += 1;
  if (path.endsWith(".html") && /^<!doctype html>$/i.test(lines[index]?.trim() ?? "")) index += 1;
  if (path.endsWith("Package.swift") && lines[index]?.startsWith("// swift-tools-version:")) index += 1;
  return index;
}

const leadingDirectivePrefixes = ["# shellcheck", "/// <reference", "// eslint", "// @ts-"];

function isIgnorableLeadingDirective(line) {
  if (/^#.*coding[:=]/.test(line)) return true;
  return leadingDirectivePrefixes.some((prefix) => line.startsWith(prefix));
}

function isBlockDirective(line) {
  return line.startsWith("/* global") || line.startsWith("/* eslint");
}

function firstSemanticLine(path, content) {
  const lines = content.split(/\r?\n/);
  let index = skipRequiredFileHeader(path, lines, 0);

  while (index < lines.length) {
    const line = lines[index].trim();
    if (line === "") {
      index += 1;
      continue;
    }
    if (isIgnorableLeadingDirective(line)) {
      index += 1;
      continue;
    }
    if (isBlockDirective(line)) {
      index = skipBlockDirective(lines, index);
      continue;
    }
    return line;
  }

  return "";
}

function hasModuleDocumentation(path) {
  const firstLine = firstSemanticLine(path, readFileSync(resolve(repoRoot, path), "utf8"));
  if (path.endsWith(".py")) return firstLine.startsWith('"""') || firstLine.startsWith("'''");
  if (path.endsWith(".sh")) return firstLine.startsWith("#");
  if (path.endsWith(".html")) return firstLine.startsWith("<!--");
  if (!firstLine.startsWith("//") && !firstLine.startsWith("/*")) return false;

  const commentText = firstLine
    .replace(/^\/[/*]+\s*/, "")
    .replace(/\s*\*\/$/, "")
    .trim();
  return !/^(?:(?:apps\/browser\/(?:src|tests)|apps\/apple|scripts|services\/science)\/\S+|[\w.-]+\.(?:css|html|js|mjs|ts))$/.test(
    commentText,
  );
}

const candidates = candidatePaths().filter(isAuthoredExecutable).sort();
const missing = candidates.filter((path) => !hasModuleDocumentation(path));

if (missing.length > 0) {
  process.stderr.write("Code-documentation hygiene check failed:\n\n");
  for (const path of missing) process.stderr.write(`- ${path}: missing module-purpose comment\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Code-documentation hygiene check passed (${candidates.length} authored executable files).\n`,
  );
}
