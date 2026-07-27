/**
 * Owns fidelity support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { FidelityProfile, PhysicsFeatureFlags, SystemParams } from "../core/types";

function resolveFidelityProfile(system: SystemParams): FidelityProfile {
  return system.dynamics?.fidelityProfile ?? "interactive";
}

function defaultsForProfile(profile: FidelityProfile): Required<PhysicsFeatureFlags> {
  if (profile === "reference") {
    return {
      observables: true,
      stellarSurface: true,
      atmosphereRT: true,
      nonSphericalFlux: true,
      thermalEnergyBalance: true,
      detectorRealism: true,
    };
  }
  if (profile === "accurate") {
    return {
      observables: true,
      stellarSurface: true,
      atmosphereRT: true,
      nonSphericalFlux: true,
      thermalEnergyBalance: true,
      detectorRealism: false,
    };
  }
  return {
    observables: true,
    stellarSurface: false,
    atmosphereRT: false,
    nonSphericalFlux: false,
    thermalEnergyBalance: false,
    detectorRealism: false,
  };
}

export function isPhysicsFeatureEnabled(system: SystemParams, feature: keyof PhysicsFeatureFlags): boolean {
  const profile = resolveFidelityProfile(system);
  const defaults = defaultsForProfile(profile);
  const explicit = system.dynamics?.physicsFeatures?.[feature];
  return explicit === undefined ? defaults[feature] : Boolean(explicit);
}
