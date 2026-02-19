import type { OrbitElements, SystemParams } from "../core/types";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";
import type { RuntimeModeV4, SimulationConfigV4 } from "../sim/v4";
import type { BinaryLabConfigV4 } from "../sim/v4/types";

function asStaticOrbit(orbit: unknown, fallback: OrbitElements): OrbitElements {
  if (!orbit || typeof orbit !== "object" || typeof orbit === "function") return fallback;
  const src = orbit as OrbitElements;
  return {
    a: Number.isFinite(src.a) ? src.a : fallback.a,
    e: Number.isFinite(src.e) ? src.e : fallback.e,
    inc: Number.isFinite(src.inc) ? src.inc : fallback.inc,
    Omega: Number.isFinite(src.Omega) ? src.Omega : fallback.Omega,
    omega: Number.isFinite(src.omega) ? src.omega : fallback.omega,
    period: Number.isFinite(src.period) ? src.period : fallback.period,
    t0: Number.isFinite(src.t0) ? src.t0 : fallback.t0,
  };
}

export function buildSimulationConfigV4FromParams(args: {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
}): SimulationConfigV4 {
  const { system, binaryMode, runtimeMode, binaryLabDefaults } = args;
  const cfg = migrateSystemParamsToV4(system);
  cfg.runtime = {
    ...(cfg.runtime ?? {}),
    mode: runtimeMode,
  };

  if (!binaryMode) return cfg;

  const binaryFallback = cfg.orbits.binary;
  const starBLum = system.star?.photometry?.phaseCurve?.constant;
  cfg.mode = "detached-binary-lab";
  cfg.binaryLab = { ...(binaryLabDefaults ?? {}) };
  cfg.bodies.stars = [
    {
      ...cfg.bodies.stars[0],
      r: system.star.r,
      m: system.star.m,
      shape: system.star.shape,
      rings: system.star.rings,
      spin: system.star.spin,
      gravityHarmonics: system.star.gravityHarmonics,
      tides: system.star.tides,
      luminosityScale: 1,
    },
    {
      ...cfg.bodies.stars[1],
      r: system.planet.r,
      m: system.planet.m,
      shape: system.planet.shape,
      rings: system.planet.rings,
      spin: system.planet.spin,
      gravityHarmonics: system.planet.gravityHarmonics,
      tides: system.planet.tides,
      luminosityScale: Number.isFinite(starBLum) ? Math.max(0, starBLum as number) : 0.3,
    },
  ];
  cfg.orbits.binary = asStaticOrbit(system.planet.orbit, binaryFallback);
  cfg.bodies.planets = [];
  cfg.bodies.moons = [];
  return cfg;
}

export function createSimulationRuntimeV4FromParams(args: {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
}): ReturnType<typeof createSimulationV4> {
  return createSimulationV4(buildSimulationConfigV4FromParams(args));
}
