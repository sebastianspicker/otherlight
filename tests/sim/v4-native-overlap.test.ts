import { describe, expect, it } from "vitest";

import { computeFluxBundle } from "../../src/sim/v4/nativeModel";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";

function makeConfig(): SimulationConfigV4 {
  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime" },
    observer: { dir: { x: 0, y: 0, z: 1 } },
    bodies: {
      stars: [
        { id: "star-a", r: 1, m: 1, luminosityScale: 1 },
        { id: "star-b", r: 1, m: 1, luminosityScale: 0 },
      ],
      planets: [],
      moons: [],
    },
    orbits: {
      binary: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      hierarchy: [],
    },
    photometry: { baselineFlux: 1 },
  };
}

function makePlanet(id: string) {
  return {
    id,
    kind: "planet",
    active: true,
    r: 0.4,
    m: 1,
    sky: { x: 0, y: 0, z: 1 },
    rAbs: { x: 0, y: 0, z: 0 },
    vAbs: { x: 0, y: 0, z: 0 },
    source: { id, r: 0.4, m: 1, orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 } },
  } as const;
}

function makeSnapshot(planets: Array<ReturnType<typeof makePlanet>>) {
  const star = {
    id: "star-a",
    kind: "star",
    active: true,
    r: 1,
    m: 1,
    luminosity: 1,
    sky: { x: 0, y: 0, z: 0 },
    rAbs: { x: 0, y: 0, z: 0 },
    vAbs: { x: 0, y: 0, z: 0 },
    source: { id: "star-a", r: 1, m: 1, luminosityScale: 1 },
  } as const;
  const byIdEntries: Array<[string, unknown]> = [
    [star.id, star],
    ...planets.map((planet) => [planet.id, planet] as [string, unknown]),
  ];
  return {
    observerDir: { x: 0, y: 0, z: 1 },
    bodies: [star, ...planets],
    stars: [star],
    planets,
    moons: [],
    byId: new Map<string, unknown>(byIdEntries),
  } as any;
}

describe("v4 native overlap handling", () => {
  it("does not double-count fully overlapping non-stellar occulters", () => {
    const config = makeConfig();
    const single = computeFluxBundle(config, makeSnapshot([makePlanet("planet-a")]), 0);
    const overlapping = computeFluxBundle(
      config,
      makeSnapshot([makePlanet("planet-a"), makePlanet("planet-b")]),
      0,
    );

    expect(overlapping.transitFactor).toBeCloseTo(single.transitFactor, 6);
    expect(overlapping.total).toBeCloseTo(single.total, 6);
  });
});
