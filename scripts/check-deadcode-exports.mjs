/** Gates unused exports/types against individually reviewed compatibility surfaces. */
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowances = JSON.parse(readFileSync(path.join(root, "scripts/deadcode-compatibility.json"), "utf8"));
const key = (entry) => `${entry.file}:${entry.kind}:${entry.symbol}`;
const allowed = new Map(allowances.map((entry) => [key(entry), entry.reason]));
if (allowed.size !== allowances.length || [...allowed.values()].some((reason) => !reason?.trim())) {
  throw new Error("Every compatibility allowance must be unique and documented");
}
const result = spawnSync(
  "pnpm",
  ["exec", "knip", "--include", "exports,types", "--reporter", "json", "--no-exit-code"],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr || "Knip export discovery failed");
const report = JSON.parse(result.stdout);
const findings = report.issues.flatMap((issue) => [
  ...(issue.exports ?? []).map((entry) => ({ file: issue.file, kind: "export", symbol: entry.name })),
  ...(issue.types ?? []).map((entry) => ({ file: issue.file, kind: "type", symbol: entry.name })),
]);
const observed = new Set(findings.map(key));
const actionable = findings.filter((entry) => !allowed.has(key(entry)));
const stale = allowances.filter((entry) => !observed.has(key(entry)));
mkdirSync(path.join(root, "test-results"), { recursive: true });
writeFileSync(
  path.join(root, "test-results/deadcode-exports.json"),
  JSON.stringify({ findings, actionable, stale, allowances }, null, 2) + "\n",
);
for (const finding of actionable) process.stderr.write(`Unused ${key(finding)}\n`);
for (const entry of stale) process.stderr.write(`Review stale compatibility allowance ${key(entry)}\n`);
if (actionable.length || stale.length) process.exitCode = 1;
else
  process.stdout.write(
    `Export/type discovery passed (${findings.length} individually documented compatibility findings; no actionable or unresolved candidates).\n`,
  );
