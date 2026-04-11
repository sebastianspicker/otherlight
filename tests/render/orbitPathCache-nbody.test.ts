import { beforeEach, describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { OrbitPathCache } from "../../src/render/orbitPathCache";
import { getNBodyStateAt, resetNBodyCache } from "../../src/sim/dynamics";

beforeEach(() => {
  resetNBodyCache();
});
import { projectToSky } from "../../src/physics/frames";
import { vSub } from "../../src/physics/vec3";

describe("OrbitPathCache with N-body", () => {
  it("reuses cached constant-orbit keys until the same orbit object mutates", () => {
    const orbit = { a: 5, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 };
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: 1,
        orbit,
      },
    };

    const cache = new OrbitPathCache({ phaseBinsPerOrbit: 360 });
    const observerDir = { x: 0, y: 0, z: 1 };

    const pts1 = cache.getPlanetPath(params, 0, observerDir, 64);
    const pts2 = cache.getPlanetPath(params, 0, observerDir, 64);
    expect(pts2).toBe(pts1);

    orbit.omega = Math.PI / 4;

    const pts3 = cache.getPlanetPath(params, 0, observerDir, 64);
    expect(pts3).not.toBe(pts1);
  });

  it("reuses cached paths for observer vectors with the same values", () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: 1,
        orbit: { a: 5, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      },
    };

    const cache = new OrbitPathCache({ phaseBinsPerOrbit: 360 });
    const pts1 = cache.getPlanetPath(params, 0, { x: 0, y: 0, z: 1 }, 64);
    const pts2 = cache.getPlanetPath(params, 0, { x: 0, y: 0, z: 1 }, 64);

    expect(pts2).toBe(pts1);
  });

  it("samples planet guide path from N-body state when N-body is enabled", () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: 1,
        orbit: { a: 5, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      },
      moon: {
        r: 0.05,
        m: 1,
        orbitAroundPlanet: { a: 0.5, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      },
      dynamics: {
        nbodyPlanetMoon: {
          enabled: true,
          muStar: 1,
          muPlanet: 1,
          muMoon: 1,
          dtMax: 1,
        },
      },
    };

    const cache = new OrbitPathCache({ phaseBinsPerOrbit: 360 });
    const observerDir = { x: 0, y: 0, z: 1 };
    const nb = getNBodyStateAt(params, 0);
    if (!nb) throw new Error("expected nbody state");
    const expected = projectToSky(vSub(nb.state.rP, nb.state.rS), observerDir);
    const pts = cache.getPlanetPath(params, 0, observerDir, 64);

    expect(pts.length).toBeGreaterThan(0);
    expect(pts[0].x).toBeCloseTo(expected.x, 9);
    expect(pts[0].y).toBeCloseTo(expected.y, 9);
  });

  it("invalidates cached N-body paths when N-body parameters change", () => {
    const mk = (muPlanet: number): SystemParams => ({
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: 1,
        orbit: { a: 5, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      },
      moon: {
        r: 0.05,
        m: 1,
        orbitAroundPlanet: { a: 0.5, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      },
      dynamics: {
        nbodyPlanetMoon: {
          enabled: true,
          muStar: 1,
          muPlanet,
          muMoon: 1,
          dtMax: 1,
        },
      },
    });

    const cache = new OrbitPathCache({ phaseBinsPerOrbit: 360 });
    const p1 = mk(1);
    const p2 = mk(10);
    const observerDir = { x: 0, y: 0, z: 1 };

    const pts1 = cache.getPlanetPath(p1, 0, observerDir, 64);
    const pts2 = cache.getPlanetPath(p2, 0, observerDir, 64);

    expect(pts2).not.toBe(pts1);
  });

  it("invalidates cached N-body paths when body-mass fallback changes effective mu", () => {
    const mk = (planetMass: number): SystemParams => ({
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: planetMass,
        orbit: { a: 5, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      },
      moon: {
        r: 0.05,
        m: 1,
        orbitAroundPlanet: { a: 0.5, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
      },
      dynamics: {
        nbodyPlanetMoon: {
          enabled: true,
          dtMax: 1,
        },
      },
    });

    const cache = new OrbitPathCache({ phaseBinsPerOrbit: 360 });
    const p1 = mk(1);
    const p2 = mk(10);
    const observerDir = { x: 0, y: 0, z: 1 };

    const pts1 = cache.getPlanetPath(p1, 0, observerDir, 64);
    const pts2 = cache.getPlanetPath(p2, 0, observerDir, 64);

    expect(pts2).not.toBe(pts1);
  });

  it("falls back to Kepler path instead of throwing on invalid N-body config", () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: { r: 1, m: 1 },
      planet: {
        r: 0.1,
        m: 1,
        orbit: { a: 5, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      },
      dynamics: {
        nbodyPlanetMoon: {
          enabled: true,
          muStar: 1,
          muPlanet: 1,
          muMoon: 1,
          dtMax: 1,
        },
      },
    };

    const cache = new OrbitPathCache({ phaseBinsPerOrbit: 360 });
    expect(() => cache.getPlanetPath(params, 0, { x: 0, y: 0, z: 1 }, 64)).not.toThrow();
  });
});
