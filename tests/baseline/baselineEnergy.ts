import type { SystemParams } from "../../src/core/types";
import { G_SI } from "../../src/core/units";
import { getNBodyStateAt } from "../../src/sim/dynamics";
import { resolveEnabledNBodyPlanetMoonConfig } from "../../src/sim/nbody/config";
import { enabledPerturberMus } from "./baselineEnergyPerturbers";
import { totalEnergyFromMu } from "./baselineEnergyVectors";

export function nbodyEnergyForPreset(params: SystemParams, tSec: number): number | undefined {
  const nbody = params.dynamics?.nbodyPlanetMoon;
  if (!nbody?.enabled) return undefined;
  const nb = getNBodyStateAt(params, tSec);
  if (!nb) return undefined;
  const resolved = resolveEnabledNBodyPlanetMoonConfig(nbody, {
    onInvalid: "disable",
    masses: { star: params.star?.m, planet: params.planet?.m, moon: params.moon?.m },
    G: G_SI,
  });
  if (!resolved) return undefined;
  const mus = [resolved.muStar, resolved.muPlanet, resolved.muMoon, ...enabledPerturberMus(nbody)];
  return totalEnergyFromMu({ state: nb.state, mus, G: G_SI });
}
