import { describe, expect, it } from "vitest";

import { AU_M, SOLAR_RADIUS_M } from "../../src/core/units";
import { bodyPhaseFlux } from "../../src/photometry/phaseCurve";
import { computeForwardScatteringFlux } from "../../src/photometry/forwardScattering";
import {
  effectiveCircleAtmosphereOpacity,
  totalAtmosphereTransmission,
} from "../../src/photometry/atmosphereRT/model";
import {
  grPrecessionPerOrbit,
  lightTimeDelaySec,
  shapiroDelaySec,
  solveLightTimeCorrectedResult,
} from "../../src/physics/relativity";
import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { createSimulationV4 } from "../../src/sim/v4/runtime";
import type { AtmosphereRTParams } from "../../src/core/types";
import { buildNativeSnapshot } from "../../src/sim/v4/nativeModel";
import { gaussianPhaseWeight } from "../../src/sim/v4/nativePhotometry";
import { transitCenteredPhaseRadFromBodyPos } from "../../src/photometry/dayNightVisibility";
import { vSub } from "../../src/physics/vec3";
import {
  ACTIVE_SCIENTIFIC_CALIBRATION_SURFACES,
  SCIENTIFIC_CALIBRATION_CATALOG,
} from "./scientific-calibration-catalog";

function highResolutionEffectiveCircleAtmosphereOpacityReference(args: {
  bodyRadius: number;
  config: AtmosphereRTParams;
  lambdaNm?: number;
  radialSamples?: number;
  shellWidthFactor?: number;
}): number {
  const bodyRadius = args.bodyRadius;
  const layers = (Array.isArray(args.config.layers) ? args.config.layers : []).filter(
    (layer) =>
      layer &&
      Number.isFinite(layer.r0) &&
      layer.r0 > 0 &&
      Number.isFinite(layer.H) &&
      layer.H > 0 &&
      Number.isFinite(layer.tau0) &&
      layer.tau0 >= 0,
  );
  if (!(Number.isFinite(bodyRadius) && bodyRadius > 0) || layers.length === 0) return 1;

  const radialSamples = Math.max(512, Math.floor(args.radialSamples ?? 4096));
  const shellWidthFactor = Math.min(1, Math.max(1e-3, args.shellWidthFactor ?? 0.25));
  const inner = Math.max(bodyRadius, Math.min(...layers.map((layer) => layer.r0)));
  const outer = Math.max(inner * 1.000001, inner + bodyRadius * shellWidthFactor);

  let weightedTransmission = 0;
  let weightSum = 0;
  for (let i = 0; i < radialSamples; i += 1) {
    const t0 = i / radialSamples;
    const t1 = (i + 1) / radialSamples;
    const rhoLo = inner + (outer - inner) * t0;
    const rhoHi = inner + (outer - inner) * t1;
    const rhoMid = 0.5 * (rhoLo + rhoHi);
    const annulusWeight = Math.max(0, rhoHi * rhoHi - rhoLo * rhoLo);
    const transmission = totalAtmosphereTransmission({
      rho: rhoMid,
      config: {
        ...args.config,
        layers,
      },
      lambdaNm: args.lambdaNm,
    });
    weightedTransmission += transmission * annulusWeight;
    weightSum += annulusWeight;
  }

  if (!(weightSum > 0)) return 1;
  return 1 - weightedTransmission / weightSum;
}

function buildScientificBrowserAdditiveBenchmarkConfig(): SimulationConfigV4 {
  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime", executionMode: "scientific-browser" },
    observer: { dir: { x: 0, y: 0, z: 1 } },
    bodies: {
      stars: [
        { id: "star-a", r: 1, m: 1, luminosityScale: 1 },
        { id: "star-b", r: 0.9, m: 0.8, luminosityScale: 0 },
      ],
      planets: [
        {
          id: "planet-1",
          r: 0.12,
          m: 0.001,
          rings: {
            innerRadius: 0.16,
            outerRadius: 0.24,
            inclination: 0.5,
            positionAngle: 0.1,
          },
          orbit: { a: 1.8, e: 0, inc: 0.02, Omega: 0, omega: 0, period: 10, t0: 0 },
        },
      ],
      moons: [
        {
          id: "moon-1",
          r: 0.04,
          m: 0.00001,
          parentPlanetId: "planet-1",
          orbit: { a: 0.32, e: 0, inc: 0.01, Omega: 0, omega: 0, period: 2.5, t0: 0.4 },
        },
      ],
    },
    orbits: {
      binary: { a: 10, e: 0, inc: 0, Omega: 0, omega: 0, period: 100, t0: 0 },
      hierarchy: [
        { childId: "planet-1", parentId: "star-a", relation: "orbits" },
        { childId: "moon-1", parentId: "planet-1", relation: "orbits" },
      ],
    },
    photometry: {
      baselineFlux: 1,
      additiveComposition: "higher-fidelity-coupled",
      phaseCurve: {
        enabled: true,
        reflAmp: 0.02,
        thermAmp: 0.01,
        reflOffset: 0,
        thermOffset: 0,
        lambertian: true,
        physicalScaling: false,
        constant: 0.002,
      },
      moonPhaseCurve: {
        enabled: true,
        reflAmp: 0.008,
        thermAmp: 0.004,
        reflOffset: 0,
        thermOffset: 0,
        lambertian: true,
        physicalScaling: false,
        constant: 0.001,
      },
      dayNightVisibility: {
        enabled: true,
        clamp: true,
        reflectedModel: "lambert",
        thermalModel: "constant",
      },
      forwardScattering: {
        enabled: true,
        amp: 0.03,
        kind: "gaussian-time",
        sigmaPhase: 0.3,
      },
      ringScattering: {
        enabled: true,
        amp: 0.02,
        sigmaPhase: 0.25,
      },
    },
  };
}

function directScientificBrowserAdditiveReference(config: SimulationConfigV4, tSec: number) {
  const snap = buildNativeSnapshot(config, tSec);
  const phot = config.photometry;
  const primaryStar = snap.stars[0];
  const planet = snap.planets[0];
  const moon = snap.moons[0];
  const planetCfg = config.bodies.planets[0];
  const moonCfg = config.bodies.moons[0];

  if (!phot || !primaryStar || !planet || !moon || !planetCfg || !moonCfg) {
    throw new Error(
      "scientific-browser additive reference requires one star, one planet, one moon, and photometry",
    );
  }

  const planetRel = vSub(planet.rAbs, primaryStar.rAbs);
  const planetPhase = bodyPhaseFlux({
    rBody: planetRel,
    rBodyRadius: planet.r,
    rStarRadius: primaryStar.r,
    observerDir: snap.observerDir,
    orbitPeriodSec: planetCfg.orbit.period,
    model: phot.phaseCurve,
    dayNightVisibility: phot.dayNightVisibility,
    thermalModelAdvanced: phot.thermalModelAdvanced,
  });

  const moonParent = moon.parentId ? snap.byId.get(moon.parentId) : undefined;
  const moonParentStar =
    moonParent?.parentId && snap.byId.get(moonParent.parentId)?.kind === "star"
      ? snap.byId.get(moonParent.parentId)
      : primaryStar;
  const moonRel = vSub(moon.rAbs, (moonParentStar ?? primaryStar).rAbs);
  const moonPhase = bodyPhaseFlux({
    rBody: moonRel,
    rBodyRadius: moon.r,
    rStarRadius: (moonParentStar ?? primaryStar).r,
    observerDir: snap.observerDir,
    orbitPeriodSec: moonCfg.orbit.period,
    model: phot.moonPhaseCurve,
    dayNightVisibility: phot.dayNightVisibility,
    thermalModelAdvanced: phot.thermalModelAdvanced,
  });

  const phase = transitCenteredPhaseRadFromBodyPos(planetRel, snap.observerDir);
  const forwardScattering = computeForwardScatteringFlux({
    rBody: planetRel,
    observerDir: snap.observerDir,
    model: phot.forwardScattering,
    phase: Number.isFinite(phase) ? phase : undefined,
  });

  let ringScattering = 0;
  const ringSc = phot.ringScattering;
  if (ringSc?.enabled && planetCfg.rings && Number.isFinite(ringSc.amp)) {
    const amp = Math.max(0, ringSc.amp as number);
    if (amp > 0) {
      const sigma = Number.isFinite(ringSc.sigmaPhase) ? Math.max(1e-4, ringSc.sigmaPhase as number) : 0.25;
      const phaseW = Number.isFinite(phase) ? gaussianPhaseWeight(phase, sigma) : 0;
      const inc = Number.isFinite(planetCfg.rings.inclination) ? (planetCfg.rings.inclination as number) : 0;
      const tilt = Math.max(0.1, Math.min(1, Math.abs(Math.cos(inc))));
      ringScattering = amp * phaseW * tilt;
    }
  }

  return {
    planetPhase,
    moonPhase,
    forwardScattering,
    ringScattering,
  };
}

describe("literature benchmark smoke", () => {
  it("keeps the scientific calibration catalog complete for the active scientific surfaces", () => {
    const ids = new Set<string>();
    const seenSurfaces = new Set<string>();
    const releaseEvidenceSurfaces = new Set<string>();
    const anchoredReleaseEvidenceEntries = new Set<string>();

    for (const entry of SCIENTIFIC_CALIBRATION_CATALOG) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);

      expect(entry.claim.length).toBeGreaterThan(0);
      expect(entry.provenance.length).toBeGreaterThan(0);
      expect(entry.tolerance.length).toBeGreaterThan(0);
      expect(entry.owner.endsWith(".test.ts")).toBe(true);
      seenSurfaces.add(entry.surface);
      if (entry.releaseEvidence) {
        releaseEvidenceSurfaces.add(entry.surface);
        expect(entry.referenceAnchor?.length ?? 0).toBeGreaterThan(0);
        anchoredReleaseEvidenceEntries.add(entry.id);
      }
    }

    expect([...seenSurfaces].sort()).toEqual([...ACTIVE_SCIENTIFIC_CALIBRATION_SURFACES].sort());
    expect([...releaseEvidenceSurfaces].sort()).toEqual([...ACTIVE_SCIENTIFIC_CALIBRATION_SURFACES].sort());
    expect(anchoredReleaseEvidenceEntries.size).toBe(
      SCIENTIFIC_CALIBRATION_CATALOG.filter((entry) => entry.releaseEvidence).length,
    );
  });
  it("keeps bounded circle-only atmosphereRT close to a high-resolution annulus reference", () => {
    const cases: Array<{ bodyRadius: number; lambdaNm: number; config: AtmosphereRTParams }> = [
      {
        bodyRadius: 0.3,
        lambdaNm: 550,
        config: {
          enabled: true,
          lambdaRefNm: 550,
          layers: [{ r0: 0.3, H: 0.05, tau0: 0.12 }],
        },
      },
      {
        bodyRadius: 0.3,
        lambdaNm: 550,
        config: {
          enabled: true,
          lambdaRefNm: 550,
          layers: [
            { r0: 0.3, H: 0.04, tau0: 0.08, cloudOpacity: 0.03 },
            { r0: 0.315, H: 0.025, tau0: 0.05 },
          ],
          cloudHaze: { enabled: true, cloudDeckTau: 0.04, hazeTau: 0.02, hazeSlope: 0 },
        },
      },
    ];

    for (const testCase of cases) {
      const approx = effectiveCircleAtmosphereOpacity(testCase);
      const reference = highResolutionEffectiveCircleAtmosphereOpacityReference({
        ...testCase,
        radialSamples: 4096,
      });
      const tolerance = Math.max(5e-4, reference * 0.03);

      expect(approx).toBeGreaterThan(0);
      expect(approx).toBeLessThan(1);
      expect(Math.abs(approx - reference)).toBeLessThanOrEqual(tolerance);
    }
  });

  it("keeps Mercury-like GR apsidal precession near the canonical 43 arcsec/century benchmark", () => {
    const precessionPerOrbit = grPrecessionPerOrbit({
      mu: 1.3271244e20,
      a: 5.790905e10,
      e: 0.20563,
      c: 299_792_458,
    });
    const arcsecPerRad = (180 / Math.PI) * 3600;
    const orbitsPerCentury = 36_525 / 87.9691;
    const arcsecPerCentury = precessionPerOrbit * arcsecPerRad * orbitsPerCentury;

    expect(arcsecPerCentury).toBeGreaterThan(40);
    expect(arcsecPerCentury).toBeLessThan(46);
    expect(arcsecPerCentury).toBeCloseTo(43, 0);
  });

  it("keeps the LTTE solver on the closed-form constant-velocity retarded-time reference", () => {
    const tObs = 100;
    const z0 = 30;
    const vz = 0.2;
    const c = 2;
    const expected = (tObs + z0 / c) / (1 - vz / c);
    const out = solveLightTimeCorrectedResult({
      tObs,
      rAtTime: (t) => ({ x: 0, y: 0, z: z0 + vz * t }),
      observerDir: { x: 0, y: 0, z: 1 },
      c,
      maxIters: 16,
      tolSec: 1e-12,
    });

    expect(out.diagnostics.status).toBe("converged");
    expect(out.diagnostics.residualSec).toBeLessThanOrEqual(1e-12);
    expect(out.tEmit).toBeCloseTo(expected, 10);
  });

  it("keeps the scientific-browser declared additive composition path on the direct photometry-model reference", async () => {
    const config = buildScientificBrowserAdditiveBenchmarkConfig();
    const sim = createSimulationV4(config);
    await sim.prepare();

    let tSampleSec = 0;
    let step = sim.step(tSampleSec);
    for (let i = 1; i <= 200; i += 1) {
      tSampleSec = i * 0.05;
      step = sim.step(tSampleSec);
      if ((step.flux.forwardScattering ?? 0) > 0 && (step.flux.ringScattering ?? 0) > 0) break;
    }

    const expected = directScientificBrowserAdditiveReference(config, tSampleSec);

    expect(step.flux.planetPhase).toBeGreaterThan(0);
    expect(step.flux.moonPhase).toBeGreaterThan(0);
    expect(step.flux.forwardScattering).toBeGreaterThan(0);
    expect(step.flux.ringScattering).toBeGreaterThan(0);
    expect(step.flux.planetPhase).toBeCloseTo(expected.planetPhase, 12);
    expect(step.flux.moonPhase).toBeCloseTo(expected.moonPhase, 12);
    expect(step.flux.forwardScattering).toBeCloseTo(expected.forwardScattering, 12);
    expect(step.flux.ringScattering).toBeCloseTo(expected.ringScattering, 12);
  });

  it("keeps one-AU light time near the canonical approximately 499 second reference", () => {
    const delaySec = lightTimeDelaySec({ x: 0, y: 0, z: -AU_M }, { x: 0, y: 0, z: 1 }, 299_792_458);

    expect(delaySec).toBeGreaterThan(498);
    expect(delaySec).toBeLessThan(500);
    expect(delaySec).toBeCloseTo(499.00478, 3);
  });

  it("keeps the solar-limb one-AU relative Shapiro scale near the expected approximately 113 microsecond band", () => {
    const delaySec = shapiroDelaySec({
      r: { x: SOLAR_RADIUS_M, y: 0, z: -AU_M },
      observerDir: { x: 0, y: 0, z: 1 },
      mu: 1.3271244e20,
      c: 299_792_458,
    });
    const magnitudeSec = Math.abs(delaySec);

    expect(magnitudeSec).toBeGreaterThan(100e-6);
    expect(magnitudeSec).toBeLessThan(130e-6);
    expect(magnitudeSec).toBeCloseTo(112.643e-6, 8);
  });

  it("keeps the solar-limb five-AU relative Shapiro scale near the expected approximately 144 microsecond band", () => {
    const delaySec = shapiroDelaySec({
      r: { x: SOLAR_RADIUS_M, y: 0, z: -5 * AU_M },
      observerDir: { x: 0, y: 0, z: 1 },
      mu: 1.3271244e20,
      c: 299_792_458,
    });
    const magnitudeSec = Math.abs(delaySec);

    expect(magnitudeSec).toBeGreaterThan(135e-6);
    expect(magnitudeSec).toBeLessThan(150e-6);
    expect(magnitudeSec).toBeCloseTo(144.352e-6, 8);
  });

  it("keeps the static LTTE plus enhanced multi-body Shapiro branch on the direct summed analytic reference delay", () => {
    const tObs = 10_000;
    const r = { x: 0, y: 0, z: 1.5e11 };
    const observerDir = { x: 0, y: 0, z: 1 };
    const c = 299_792_458;
    const masses = [
      { mu: 1.3271244e20, r: { x: 0, y: 0, z: 0 } },
      { mu: 3.986004418e14, r: { x: 4.2e10, y: 0, z: 2.5e10 } },
    ];
    const expected =
      tObs -
      (lightTimeDelaySec(r, observerDir, c) +
        masses.reduce(
          (sum, mass) =>
            sum +
            shapiroDelaySec({
              r: { x: r.x - mass.r.x, y: r.y - mass.r.y, z: r.z - mass.r.z },
              observerDir,
              mu: mass.mu,
              c,
            }),
          0,
        ));
    const out = solveLightTimeCorrectedResult({
      tObs,
      rAtTime: () => r,
      observerDir,
      c,
      shapiro: {
        enabled: true,
        massesAtTime: () => masses,
      },
      maxIters: 8,
      tolSec: 1e-12,
    });

    expect(out.diagnostics.status).toBe("converged");
    expect(out.diagnostics.usedMultiBodyShapiro).toBe(true);
    expect(out.diagnostics.residualSec).toBeLessThanOrEqual(1e-12);
    expect(out.tEmit).toBeCloseTo(expected, 10);
  });

  it("keeps the static LTTE plus Shapiro branch on the direct analytic reference delay", () => {
    const tObs = 10_000;
    const r = { x: 0, y: 0, z: 1.5e11 };
    const observerDir = { x: 0, y: 0, z: 1 };
    const c = 299_792_458;
    const mu = 1.3271244e20;
    const expected =
      tObs - (lightTimeDelaySec(r, observerDir, c) + shapiroDelaySec({ r, observerDir, mu, c }));
    const out = solveLightTimeCorrectedResult({
      tObs,
      rAtTime: () => r,
      observerDir,
      c,
      shapiro: {
        enabled: true,
        mu,
      },
      maxIters: 8,
      tolSec: 1e-12,
    });

    expect(out.diagnostics.status).toBe("converged");
    expect(out.diagnostics.residualSec).toBeLessThanOrEqual(1e-12);
    expect(out.tEmit).toBeCloseTo(expected, 10);
  });
});
