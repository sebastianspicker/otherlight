/**
 * Generates the checked-in Education V4 native-parity contract directly from
 * the browser implementation. This is a release input, not a test fixture.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = path.join(root, "apps/browser");
const output = path.join(root, "contracts/education-v4/fixtures/scoped-parity.json");
const scopedPresetIds = ["default", "kepler-planet-only", "limb-darkening-variation"];

function checkedGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

function sourceRevision() {
  const revision = checkedGit(["rev-parse", "HEAD"]);
  const changed = spawnSync(
    "git",
    ["diff", "--quiet", "HEAD", "--", "apps/browser/src", "scripts/export-native-parity-fixtures.mjs"],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  if (changed.status !== 0 && changed.status !== 1) process.exit(changed.status ?? 1);
  return `${revision}${changed.status === 1 ? "+dirty" : ""}`;
}

function finiteJson(value, label = "manifest") {
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error(`${label} contains a non-finite number`);
  if (Array.isArray(value)) value.forEach((entry, index) => finiteJson(entry, `${label}[${index}]`));
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) finiteJson(entry, `${label}.${key}`);
  }
}

async function main() {
  const vite = await createServer({
    root: browserRoot,
    configFile: path.join(browserRoot, "vite.config.ts"),
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });
  try {
    const { PRESETS } = await vite.ssrLoadModule("/src/application/presets.ts");
    const { createSimulationV4, mapBrowserScenarioDraftToEducationScenarioV4 } = await vite.ssrLoadModule(
      "/src/domain/simulation/v4/index.ts",
    );
    const scenarios = scopedPresetIds.map((id) => {
      const preset = PRESETS.find((candidate) => candidate.id === id);
      if (!preset) throw new Error(`Missing scoped preset: ${id}`);
      const scenario = mapBrowserScenarioDraftToEducationScenarioV4(preset.params);
      scenario.runtime = { mode: "realtime", executionMode: "interactive", referenceSubsteps: 5 };
      const periodSec = scenario.bodies.planets[0]?.orbit.period ?? scenario.orbits.binary.period;
      const sampleTimesSec = [0, periodSec / 8, periodSec / 4, periodSec / 2];
      const runtime = createSimulationV4(scenario);
      return {
        id,
        label: preset.label,
        sampleTimesSec,
        scenario,
        expectedSteps: sampleTimesSec.map((timeSec) => {
          const step = runtime.step(timeSec);
          const timing = Object.fromEntries(
            Object.entries(step.timing ?? {}).filter(([, value]) => Number.isFinite(value)),
          );
          return {
            timeSec: step.tObsSec,
            kinematics: { planetSky: step.kinematics.planetSky, moonSky: step.kinematics.moonSky },
            flux: {
              total: step.flux.total,
              transitFactor: step.flux.transitFactor,
              stellarPreTransit: step.flux.stellarPreTransit,
              planetPhase: step.flux.planetPhase,
              moonPhase: step.flux.moonPhase,
            },
            timing: Object.keys(timing).length ? timing : undefined,
            renderSignals: {
              occulters: step.renderSignals.occulterGeometry,
              events: step.renderSignals.eventMarkers,
            },
            warningFlags: [...step.renderSignals.uncertaintyFlags].sort(),
          };
        }),
      };
    });
    const manifest = {
      contractVersion: "education-v4/1",
      generator: "scripts/export-native-parity-fixtures.mjs",
      sourceRevision: sourceRevision(),
      comparisonPolicy: {
        exactFields: ["scenario.version", "scenario.mode", "renderSignals.events", "warningFlags"],
        floating: { absolute: 1e-10, relative: 1e-9 },
      },
      scenarios,
    };
    finiteJson(manifest);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } finally {
    await vite.close();
  }
}

await main();
