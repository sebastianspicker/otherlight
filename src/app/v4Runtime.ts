import type { SystemParams } from "../core/types";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";
import type { RuntimeModeV4, SimulationConfigV4 } from "../sim/v4";
import { collectUnsupportedPhotometryFeaturesV4 } from "../sim/v4/migrate";
import type { BinaryLabConfigV4 } from "../sim/v4/types";
import { sanitizeStaticOrbit } from "../sim/v4/orbitSanitizer";
import {
  createReferenceSimulationV4,
  type ReferenceClientOptions,
  type SimulationRuntimeV4WithDispose,
} from "../sim/v4/referenceClient";

export type AppSimulationRuntime = SimulationRuntimeV4WithDispose;

function buildSimulationConfigV4FromParams(args: {
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
  cfg.orbits.binary = sanitizeStaticOrbit(system.planet.orbit, binaryFallback);
  cfg.bodies.planets = [];
  cfg.bodies.moons = [];
  return cfg;
}

export function createSimulationRuntimeV4FromParams(args: {
  system: SystemParams;
  binaryMode: boolean;
  runtimeMode: RuntimeModeV4;
  binaryLabDefaults?: BinaryLabConfigV4;
  referenceClient?: ReferenceClientOptions;
}): AppSimulationRuntime {
  const cfg = buildSimulationConfigV4FromParams(args);
  const unsupportedFeatures = collectUnsupportedPhotometryFeaturesV4(cfg);
  let pendingStatusMessage =
    unsupportedFeatures.length > 0
      ? "Forward scattering and ring scattering are disabled in V4 runtime; ignoring those parameters."
      : undefined;

  const takeStatusMessage = (delegate?: () => string | undefined): string | undefined => {
    if (pendingStatusMessage) {
      const message = pendingStatusMessage;
      pendingStatusMessage = undefined;
      return message;
    }
    return delegate?.();
  };

  if (args.runtimeMode === "reference") {
    const runtime = createReferenceSimulationV4(cfg, args.referenceClient);
    return {
      ...runtime,
      takeStatusMessage: () => takeStatusMessage(runtime.takeStatusMessage),
    };
  }
  const rt = createSimulationV4(cfg);
  return {
    ...rt,
    dispose: () => {},
    takeStatusMessage: () => takeStatusMessage(),
  };
}
