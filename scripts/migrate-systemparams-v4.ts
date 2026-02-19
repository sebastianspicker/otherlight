#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import type { SystemParams } from "../src/core/types";
import { migrateSystemParamsToV4 } from "../src/sim/v4/migrate";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function migrateSystemParamsV4(input: SystemParams) {
  return migrateSystemParamsToV4(input);
}

export function migrateScenarioJsonToV4(input: unknown): unknown {
  if (!isObject(input)) return input;

  if (!isObject((input as any).defaults)) {
    return migrateSystemParamsToV4(input as SystemParams);
  }

  const out = { ...input } as Record<string, unknown>;
  out.defaults = migrateSystemParamsToV4((input as any).defaults as SystemParams);

  if (isObject(out.meta)) {
    const meta = { ...out.meta } as Record<string, unknown>;
    meta.version = 4;
    meta.schema = "SystemParamsV4+Controls/v4";
    out.meta = meta;
  }

  return out;
}

function main(): void {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error(
      "Usage: node --experimental-strip-types scripts/migrate-systemparams-v4.ts <input.json> [output.json]",
    );
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inputPath);
  const raw = fs.readFileSync(absIn, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const migrated = migrateScenarioJsonToV4(parsed);
  const text = `${JSON.stringify(migrated, null, 2)}\n`;

  if (outputPath) {
    const absOut = path.resolve(process.cwd(), outputPath);
    fs.writeFileSync(absOut, text, "utf8");
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] && process.argv[1].includes("migrate-systemparams-v4.ts")) {
  main();
}
