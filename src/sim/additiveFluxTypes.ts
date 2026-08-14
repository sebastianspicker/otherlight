/** Defines internal additive-flux contexts and the stable component result contract. */
import type { AtmosphereRTParams, SystemParams, ThermalModelAdvancedParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";
import type { BodyKinematics } from "./kinematics";
import type { resolveOrbitElements } from "./orbits";

export type SkyPosition = { x: number; y: number; z: number };
export type BandWeight = { lambdaNm: number; w: number };
export type FluxPair = { fluxPlanetOnly: number; fluxMoonOnly: number };
export type AdditiveFluxComponents = {
  fluxPlanetOnly: number;
  fluxMoonOnly: number;
  fluxStellarVarOnly: number;
  fluxForwardScatteringOnly: number;
  fluxRingScatteringOnly: number;
  fluxRefractionOnly: number;
  planetVisibleFraction?: number;
  moonVisibleFraction?: number;
};
export type VisibleFractions = Pick<AdditiveFluxComponents, "planetVisibleFraction" | "moonVisibleFraction">;
export type AdditiveFluxContext = {
  params: SystemParams;
  t: number;
  observerDir: Vec3;
  kin: BodyKinematics;
  phot: SystemParams["star"]["photometry"];
  starRadius: number;
  bands: BandWeight[];
  orbit: ReturnType<typeof resolveOrbitElements>;
  thermalModelAdvanced: ThermalModelAdvancedParams | undefined;
  scientificEnergyComposition: boolean;
  rt: AtmosphereRTParams | undefined;
};
