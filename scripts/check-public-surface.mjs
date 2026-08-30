/**
 * Rejects generated, private, or workstation-specific files before they enter
 * the public candidate, including force-staged paths ignored by Git.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const forbiddenPaths = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)\._[^/]+$/,
  /(^|\/)(Thumbs\.db|Desktop\.ini)$/i,
  /^(\.agents|\.claude|\.codacy|\.codegraph|\.codex|\.continue|\.cursor|\.gemini|\.idea|\.kilo|\.serena|\.vscode|\.windsurf)(\/|$)/,
  /^\.impeccable(\/|$)/,
  /^(?:AGENTS?|CLAUDE|CODEX|GEMINI)\.md$/i,
  /^\.cursorrules$/,
  /^\.github\/(?:codex|instructions|prompts)(\/|$)/,
  /^\.github\/copilot-instructions\.md$/,
  /^apps\/browser\/playwright\.config\.[cm]?[jt]s$/,
  /^apps\/browser\/tests\/e2e\//,
  /^scripts\/capture-github-screenshots(?:[.-]|$)/,
  /^\.science-cache(\/|$)/,
  /^(artifacts|blob-report|coverage|dist|dist-ssr|node_modules|playwright-report|reports|screenshots|test-results)(\/|$)/,
  /^services\/science\/(?:build|dist)(\/|$)/,
  /^services\/science\/[^/]+\.egg-info(\/|$)/,
  /(^|\/)(?:__pycache__|\.build|\.pytest_cache|\.pyright|\.ruff_cache|\.swiftpm|\.venv)(\/|$)/,
  /^docs\/(archive|audit|agent|source-audit)(\/|$)/,
  /^docs\/screenshots\/(?:manifest\.json|[^/]+\.png)$/,
  /^(deprecated|external|vendor|third-party|third_party|3rdparty)(\/|$)/,
  /(^|\/)(?:refactor[-_]plan|remediation[-_](?:plan|ledger|status)|github[-_]refresh[-_](?:plan|progress)|[^/]*[-_]ledger[^/]*)\.md$/i,
  /^(?:agent[-_]audit[-_]report|audit|decisions|findings|log)\.md$/i,
  /^(?:agent[-_](?:context|memory|notes|output|report)|ai[-_](?:audit|notes|report|summary))(?:\..+)?$/i,
  /^(?:prompt|prompts|scratch|task[-_]report|task[-_]summary|session[-_]summary|conversation[-_]export)\.(?:md|txt|json|jsonl)$/i,
  /(^|\/)(credentials|secrets)\.json$/i,
  /(^|\/)\.env(?:\..+)?$/,
  /(^|\/).+\.(?:arrow|crt|csr|db|feather|ipc|jks|jsonl|key|keystore|log|mobileprovision|p12|parquet|pem|pfx|py[co]|sarif|sqlite)$/i,
];

const allowedEnvironmentExamples = new Set([".env.example", ".env.sample"]);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);
const protectedContentPaths = new Set([".npmrc"]);
const privateContentPatterns = [
  { label: "macOS absolute user path", pattern: /\/Users\/[^/\s]+\// },
  { label: "Linux absolute user path", pattern: /\/home\/[^/\s]+\// },
  { label: "Windows absolute user path", pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/ },
  { label: "private key material", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
];

function publicCandidatePaths() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return (
    output
      .split("\0")
      .filter(Boolean)
      // `git ls-files` already returns file entries. Avoid statting non-text
      // metadata here: a policy-protected file must not crash the whole hygiene
      // scan before path checks and eligible text-content checks can run.
      .filter((path) => existsSync(resolve(repoRoot, path)))
  );
}

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot).toLowerCase() : "";
}

function pathViolation(path) {
  if (allowedEnvironmentExamples.has(path)) return undefined;
  return forbiddenPaths.some((pattern) => pattern.test(path))
    ? "local, generated, or sensitive path"
    : undefined;
}

function contentInspection(path) {
  // Authentication-bearing package-manager configuration is ownership- and
  // path-checked here, but its contents are left to the dedicated secret scan.
  if (protectedContentPaths.has(path) || !textExtensions.has(extension(path))) {
    return { violations: [] };
  }
  const absolutePath = resolve(repoRoot, path);
  try {
    if (statSync(absolutePath).size > 2_000_000) return { violations: [] };
    const content = readFileSync(absolutePath, "utf8");
    return {
      violations: privateContentPatterns
        .filter(({ pattern }) => pattern.test(content))
        .map(({ label }) => label),
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown error";
    return { violations: [], unverified: `content inspection unavailable (${code})` };
  }
}

const candidates = publicCandidatePaths();
const violations = [];
const unverified = [];
for (const path of candidates) {
  const pathReason = pathViolation(path);
  if (pathReason) {
    violations.push(`${path}: ${pathReason}`);
    // Never inspect content from a path already classified as local or
    // sensitive; the path itself is sufficient evidence for rejection.
    continue;
  }
  const inspection = contentInspection(path);
  if (inspection.unverified) unverified.push(`${path}: ${inspection.unverified}`);
  for (const reason of inspection.violations) violations.push(`${path}: ${reason}`);
}

if (violations.length > 0) {
  process.stderr.write("Public-surface hygiene check failed:\n\n");
  for (const violation of violations) process.stderr.write(`- ${violation}\n`);
  process.exitCode = 1;
} else if (unverified.length > 0) {
  process.stderr.write("Public-surface hygiene check incomplete:\n\n");
  for (const item of unverified) process.stderr.write(`- ${item}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`Public-surface hygiene check passed (${candidates.length} candidate files).\n`);
}
