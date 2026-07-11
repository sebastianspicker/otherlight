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
  /^\.impeccable\/live(\/|$)/,
  /^(artifacts|blob-report|coverage|dist|dist-ssr|node_modules|playwright-report|reports|screenshots|test-results)(\/|$)/,
  /^docs\/(archive|audit|agent|source-audit)(\/|$)/,
  /^(deprecated|external|vendor|third-party|third_party|3rdparty)(\/|$)/,
  /(^|\/)(credentials|secrets)\.json$/i,
  /(^|\/)\.env(?:\..+)?$/,
  /(^|\/).+\.(?:crt|csr|db|jks|jsonl|key|keystore|log|mobileprovision|p12|pem|pfx|sarif|sqlite)$/i,
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
  return output
    .split("\0")
    .filter(Boolean)
    .filter((path) => existsSync(resolve(repoRoot, path)) && statSync(resolve(repoRoot, path)).isFile());
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

function contentViolations(path) {
  if (!textExtensions.has(extension(path))) return [];
  const absolutePath = resolve(repoRoot, path);
  if (statSync(absolutePath).size > 2_000_000) return [];
  const content = readFileSync(absolutePath, "utf8");
  return privateContentPatterns.filter(({ pattern }) => pattern.test(content)).map(({ label }) => label);
}

const candidates = publicCandidatePaths();
const violations = [];
for (const path of candidates) {
  const pathReason = pathViolation(path);
  if (pathReason) violations.push(`${path}: ${pathReason}`);
  for (const reason of contentViolations(path)) violations.push(`${path}: ${reason}`);
}

if (violations.length > 0) {
  process.stderr.write("Public-surface hygiene check failed:\n\n");
  for (const violation of violations) process.stderr.write(`- ${violation}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Public-surface hygiene check passed (${candidates.length} candidate files).\n`);
}
