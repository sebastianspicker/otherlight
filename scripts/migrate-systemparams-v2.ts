#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import type { SystemParamsV2 } from "../src/core/types";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function migrateSystemParamsV2(input: unknown): SystemParamsV2 {
  const cloned = JSON.parse(JSON.stringify(input)) as SystemParamsV2;
  const ph = cloned.star?.photometry;

  if (ph) {
    if (ph.atmosphereTransmission?.enabled && !ph.atmosphereRT) {
      ph.atmosphereRT = {
        enabled: true,
        target: ph.atmosphereTransmission.target ?? "planet",
        layers: [
          {
            r0: ph.atmosphereTransmission.r0 ?? cloned.planet.r,
            H: ph.atmosphereTransmission.H ?? 0,
            tau0: ph.atmosphereTransmission.tau0 ?? 0,
            alpha: 4,
          },
        ],
      };
    }

    if (ph.phaseCurve?.thermalInertia && !ph.thermalModelAdvanced) {
      ph.thermalModelAdvanced = {
        enabled: Boolean(ph.phaseCurve.thermalInertia.enabled),
        redistribution: ph.phaseCurve.thermalInertia.redistribution,
        tauSec: ph.phaseCurve.thermalInertia.thermalTimescaleSec,
        equilibriumScale: 1 - (ph.phaseCurve.thermalInertia.albedo ?? 0),
      };
    }
  }

  cloned.dynamics = cloned.dynamics ?? {};
  cloned.dynamics.integrator = cloned.dynamics.integrator ?? {
    mode: "fixed-verlet",
  };
  cloned.dynamics.relativityLevel = cloned.dynamics.relativityLevel ?? "toy";
  cloned.didactics = cloned.didactics ?? {
    enabled: true,
    activeLessonId: "kepler-geometry",
    autoAssess: true,
  };

  return cloned;
}

export function migrateScenarioJson(input: unknown): unknown {
  if (!isObject(input)) return input;
  if (!isObject(input.defaults)) {
    return migrateSystemParamsV2(input);
  }
  const out = { ...input } as Record<string, unknown>;
  out.defaults = migrateSystemParamsV2(input.defaults);

  if (isObject(out.meta)) {
    const meta = { ...out.meta } as Record<string, unknown>;
    meta.version = 2;
    meta.schema = "SystemParamsV2+Controls/v2";
    out.meta = meta;
  }
  return out;
}

function main(): void {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath) {
    console.error("Usage: node scripts/migrate-systemparams-v2.ts <input.json> [output.json]");
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inputPath);
  const raw = fs.readFileSync(absIn, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const migrated = migrateScenarioJson(parsed);
  const text = `${JSON.stringify(migrated, null, 2)}\n`;

  if (outputPath) {
    const absOut = path.resolve(process.cwd(), outputPath);
    fs.writeFileSync(absOut, text, "utf8");
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] && process.argv[1].includes("migrate-systemparams-v2.ts")) {
  main();
}
