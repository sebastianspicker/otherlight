/**
 * Enforces concise API documentation on Swift declarations so native behavior
 * remains understandable without reconstructing intent from implementation.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const declarationKinds = new Set([
  "struct",
  "class",
  "actor",
  "enum",
  "protocol",
  "extension",
  "func",
  "init",
  "deinit",
  "subscript",
]);
const declarationModifiers = new Set([
  "public",
  "package",
  "internal",
  "private",
  "fileprivate",
  "open",
  "final",
  "static",
  "mutating",
  "nonmutating",
  "override",
  "required",
  "convenience",
  "isolated",
  "nonisolated",
  "distributed",
  "indirect",
  "prefix",
  "postfix",
  "infix",
  "borrowing",
  "consuming",
]);

/** Removes same-line attributes before matching the underlying declaration. */
function stripLeadingAttributes(line) {
  let remaining = line.trimStart();
  while (remaining.startsWith("@")) {
    const match = remaining.match(/^@[A-Za-z_][\w.]*(?:\([^)]*\))?\s*/);
    if (!match) break;
    remaining = remaining.slice(match[0].length);
  }
  return remaining;
}

function isSwiftKeywordCharacter(code) {
  const lowercase = code | 32;
  return code === 95 || (code >= 48 && code <= 57) || (lowercase >= 97 && lowercase <= 122);
}

function leadingKeyword(value) {
  let end = 0;
  while (end < value.length && isSwiftKeywordCharacter(value.charCodeAt(end))) end += 1;
  if (end === 0) return null;
  return { keyword: value.slice(0, end), rest: value.slice(end) };
}

function declarationKind(line) {
  let remaining = line.trimStart();
  while (remaining.length > 0) {
    const leading = leadingKeyword(remaining);
    if (!leading) return null;

    const nextKeyword = leadingKeyword(leading.rest.trimStart())?.keyword;
    if (leading.keyword === "class" && nextKeyword !== undefined && declarationKinds.has(nextKeyword)) {
      remaining = leading.rest.trimStart();
      continue;
    }
    if (declarationKinds.has(leading.keyword)) return leading.keyword;
    if (!declarationModifiers.has(leading.keyword)) return null;
    remaining = leading.rest.trimStart();
  }
  return null;
}

/** Reports whether a declaration is immediately preceded by a Swift doc comment. */
function hasDeclarationDocumentation(lines, declarationIndex) {
  let index = declarationIndex - 1;

  while (index >= 0 && isTransparentDocumentationPrefix(lines[index].trim())) index -= 1;

  const previous = lines[index]?.trim() ?? "";
  if (previous.startsWith("///")) return true;
  if (!previous.endsWith("*/")) return false;

  return hasDocumentationBlockStart(lines, index);
}

function isTransparentDocumentationPrefix(line) {
  return line.startsWith("@") || /^#(?:if|elseif|else|endif)\b/.test(line);
}

function hasDocumentationBlockStart(lines, index) {
  while (index >= 0) {
    const line = lines[index].trim();
    if (line.startsWith("/**")) return true;
    if (line.startsWith("/*") && !line.startsWith("/**")) return false;
    index -= 1;
  }
  return false;
}

function adjustBlockCommentDepth(state, line) {
  state.blockCommentDepth += (line.match(/\/\*/g) ?? []).length;
  state.blockCommentDepth -= (line.match(/\*\//g) ?? []).length;
}

function shouldSkipSwiftSourceLine(state, originalLine) {
  const trimmed = originalLine.trimStart();
  if (state.multilineStringDelimiter) {
    if (trimmed.includes(state.multilineStringDelimiter)) state.multilineStringDelimiter = null;
    return true;
  }
  if (state.blockCommentDepth > 0) {
    adjustBlockCommentDepth(state, originalLine);
    return true;
  }
  if (trimmed.startsWith("/*")) {
    adjustBlockCommentDepth(state, originalLine);
    return true;
  }
  if (trimmed.startsWith("//")) return true;
  if (trimmed.includes('"""')) {
    const occurrences = trimmed.split('"""').length - 1;
    if (occurrences % 2 === 1) state.multilineStringDelimiter = '"""';
  }
  return false;
}

/** Finds named Swift declarations that lack adjacent documentation comments. */
export function findUndocumentedSwiftDeclarations(source, path = "<source>") {
  const lines = source.split(/\r?\n/);
  const missing = [];
  const lexicalState = { blockCommentDepth: 0, multilineStringDelimiter: null };

  for (let index = 0; index < lines.length; index += 1) {
    const originalLine = lines[index];
    const trimmed = originalLine.trimStart();
    if (shouldSkipSwiftSourceLine(lexicalState, originalLine)) continue;

    const declarationLine = stripLeadingAttributes(originalLine);
    const kind = declarationKind(declarationLine);
    if (!kind || hasDeclarationDocumentation(lines, index)) continue;

    missing.push({
      kind,
      line: index + 1,
      path,
      source: trimmed.trimEnd(),
    });
  }

  return missing;
}

/** Returns tracked and visible untracked Swift sources in the native application tree. */
function swiftSourcePaths() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => path.startsWith("apps/apple/") && path.endsWith(".swift"))
    .filter((path) => existsSync(resolve(repoRoot, path)))
    .sort();
}

/** Emits stable, line-addressable findings for local use and CI annotations. */
function report(missing, fileCount) {
  if (missing.length > 0) {
    process.stderr.write("Swift documentation check failed:\n\n");
    for (const finding of missing) {
      process.stderr.write(
        `- ${finding.path}:${finding.line}: undocumented ${finding.kind}: ${finding.source}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Swift documentation check passed (${fileCount} source files).\n`);
}

/** Runs either the repository gate or the stdin fixture mode used by regression tests. */
function main(args) {
  if (args.length === 0) {
    const paths = swiftSourcePaths();
    const missing = paths.flatMap((path) =>
      findUndocumentedSwiftDeclarations(readFileSync(resolve(repoRoot, path), "utf8"), path),
    );
    report(missing, paths.length);
    return;
  }

  if (args.length === 2 && args[0] === "--stdin") {
    const path = args[1];
    report(findUndocumentedSwiftDeclarations(readFileSync(0, "utf8"), path), 1);
    return;
  }

  process.stderr.write("Usage: node scripts/check-swift-documentation.mjs [--stdin <path>]\n");
  process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
