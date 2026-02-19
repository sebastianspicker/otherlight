const LEGACY_TO_NAMESPACED: Record<string, string> = {
  nbodyMuStar: "dynamics.nbody.muStar",
  nbodyMuPlanet: "dynamics.nbody.muPlanet",
  nbodyMuMoon: "dynamics.nbody.muMoon",
  nbodyDtMax: "dynamics.nbody.dtMax",
  nbodySoftening: "dynamics.nbody.softening",
  planetRingInc: "bodies.planet.rings.inclinationDeg",
  planetRingAngle: "bodies.planet.rings.positionAngleDeg",
  moonRingInc: "bodies.moon.rings.inclinationDeg",
  moonRingAngle: "bodies.moon.rings.positionAngleDeg",
  planetOblateness: "bodies.planet.shape.oblateness",
  moonOblateness: "bodies.moon.shape.oblateness",
  relEnabled: "dynamics.relativity.enabled",
  relLTTE: "dynamics.relativity.ltte",
  relShapiro: "dynamics.relativity.shapiro",
  relGR: "dynamics.relativity.grPrecession",
};

const NAMESPACED_TO_LEGACY: Record<string, string> = Object.fromEntries(
  Object.entries(LEGACY_TO_NAMESPACED).map(([legacy, namespaced]) => [namespaced, legacy]),
);

export function toNamespacedParamId(paramId: string): string {
  return LEGACY_TO_NAMESPACED[paramId] ?? paramId;
}

export function toLegacyParamId(paramId: string): string {
  return NAMESPACED_TO_LEGACY[paramId] ?? paramId;
}

export function migrateParamRecordToNamespaced<T extends string | number | boolean>(
  input: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(input)) {
    out[toNamespacedParamId(k)] = v;
  }
  return out;
}

export function migrateParamRecordToLegacy<T extends string | number | boolean>(
  input: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(input)) {
    out[toLegacyParamId(k)] = v;
  }
  return out;
}

export function getParamIdMigrationTable(): Record<string, string> {
  return { ...LEGACY_TO_NAMESPACED };
}
