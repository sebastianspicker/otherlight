import { expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { computeAdditiveFluxComponents } from "../../src/sim/additiveFlux";

function makeSystem(): SystemParams {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: {
      r: 1,
      photometry: {
        phaseCurve: {
          enabled: true,
          reflAmp: 0.02,
          thermAmp: 0.01,
          reflOffset: 0,
          thermOffset: 0,
          lambertian: true,
          constant: 0,
        },
        forwardScattering: {
          enabled: true,
          amp: 0.03,
          kind: "gaussian-time",
          sigmaPhase: 0.2,
        },
        atmosphereRT: {
          enabled: true,
          target: "planet",
          emission: { enabled: true, amp: 0.04, phaseLag: 0.1 },
        },
      },
    },
    planet: {
      r: 0.1,
      orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 10, t0: 0 },
    },
  };
}

it("keeps forward scattering separate from phase and emission terms", () => {
  const base = makeSystem();
  const kin = {
    planetOrbit: base.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 0, y: 0, z: 1 },
  };

  const allTerms = computeAdditiveFluxComponents(base, 2.5, { x: 0, y: 0, z: 1 }, kin as any);
  const noScatter = computeAdditiveFluxComponents(
    {
      ...base,
      star: {
        ...base.star,
        photometry: {
          ...base.star.photometry,
          forwardScattering: { ...base.star.photometry!.forwardScattering!, enabled: false },
        },
      },
    },
    2.5,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );

  expect(allTerms.fluxForwardScatteringOnly).toBeGreaterThanOrEqual(0);
  expect(allTerms.fluxPlanetOnly).toBeGreaterThan(0);
  expect(noScatter.fluxPlanetOnly).toBeCloseTo(allTerms.fluxPlanetOnly, 12);
  expect(noScatter.fluxForwardScatteringOnly).toBe(0);
});

it("suppresses atmosphere RT emission thermal double counting on the accurate path", () => {
  const base = makeSystem();
  const interactiveWithRt: SystemParams = {
    ...base,
    dynamics: {
      fidelityProfile: "interactive",
      physicsFeatures: { atmosphereRT: true, thermalEnergyBalance: true },
    },
  };
  const accurateWithRt: SystemParams = {
    ...base,
    dynamics: {
      fidelityProfile: "accurate",
      physicsFeatures: { atmosphereRT: true, thermalEnergyBalance: true },
    },
  };
  const kin = {
    planetOrbit: base.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 0, y: 0, z: 1 },
  };

  const interactive = computeAdditiveFluxComponents(interactiveWithRt, 2.5, { x: 0, y: 0, z: 1 }, kin as any);
  const accurate = computeAdditiveFluxComponents(accurateWithRt, 2.5, { x: 0, y: 0, z: 1 }, kin as any);
  const accurateNoEmission = computeAdditiveFluxComponents(
    {
      ...accurateWithRt,
      star: {
        ...accurateWithRt.star,
        photometry: {
          ...accurateWithRt.star.photometry,
          atmosphereRT: {
            ...accurateWithRt.star.photometry!.atmosphereRT!,
            emission: { ...accurateWithRt.star.photometry!.atmosphereRT!.emission!, enabled: false },
          },
        },
      },
    },
    2.5,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );

  expect(interactive.fluxPlanetOnly).toBeGreaterThan(accurate.fluxPlanetOnly);
  expect(accurate.fluxPlanetOnly).toBeCloseTo(accurateNoEmission.fluxPlanetOnly, 12);
});

it("suppresses forward scattering reflective double counting on the accurate path", () => {
  const base = makeSystem();
  const interactiveWithFidelity: SystemParams = {
    ...base,
    dynamics: {
      fidelityProfile: "interactive",
      physicsFeatures: { atmosphereRT: true, thermalEnergyBalance: true },
    },
  };
  const accurateWithFidelity: SystemParams = {
    ...base,
    dynamics: {
      fidelityProfile: "accurate",
      physicsFeatures: { atmosphereRT: true, thermalEnergyBalance: true },
    },
  };
  const kin = {
    planetOrbit: base.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 0, y: 0, z: 1 },
  };

  const interactive = computeAdditiveFluxComponents(
    interactiveWithFidelity,
    0,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );
  const accurate = computeAdditiveFluxComponents(accurateWithFidelity, 0, { x: 0, y: 0, z: 1 }, kin as any);
  const accurateNoScatter = computeAdditiveFluxComponents(
    {
      ...accurateWithFidelity,
      star: {
        ...accurateWithFidelity.star,
        photometry: {
          ...accurateWithFidelity.star.photometry,
          forwardScattering: {
            ...accurateWithFidelity.star.photometry!.forwardScattering!,
            enabled: false,
          },
        },
      },
    },
    0,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );

  expect(interactive.fluxForwardScatteringOnly).toBeGreaterThan(0);
  expect(accurate.fluxForwardScatteringOnly).toBe(0);
  expect(accurate.fluxForwardScatteringOnly).toBeCloseTo(accurateNoScatter.fluxForwardScatteringOnly, 12);
});

it("anchors forward scattering to transit geometry instead of periapsis phase", () => {
  const system = makeSystem();
  const kin = {
    planetOrbit: system.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 0, y: 0, z: 1 },
  };

  const nearTransit = computeAdditiveFluxComponents(system, 0, { x: 0, y: 0, z: 1 }, kin as any);
  const sameGeometryDifferentEpoch = computeAdditiveFluxComponents(
    system,
    5,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );

  expect(sameGeometryDifferentEpoch.fluxForwardScatteringOnly).toBeCloseTo(
    nearTransit.fluxForwardScatteringOnly,
    12,
  );
});

it("suppresses ring scattering reflective double counting on the accurate path", () => {
  const base = makeSystem();
  const systemWithRings: SystemParams = {
    ...base,
    planet: {
      ...base.planet,
      rings: { innerRadius: 0.14, outerRadius: 0.22, inclination: 0.4 },
    },
    star: {
      ...base.star,
      photometry: {
        ...base.star.photometry,
        ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
      },
    },
  };
  const interactiveWithFidelity: SystemParams = {
    ...systemWithRings,
    dynamics: {
      fidelityProfile: "interactive",
      physicsFeatures: {
        atmosphereRT: true,
        thermalEnergyBalance: true,
        nonSphericalFlux: true,
      },
    },
  };
  const accurateWithFidelity: SystemParams = {
    ...systemWithRings,
    dynamics: {
      fidelityProfile: "accurate",
      physicsFeatures: {
        atmosphereRT: true,
        thermalEnergyBalance: true,
        nonSphericalFlux: true,
      },
    },
  };
  const kin = {
    planetOrbit: base.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 0, y: 0, z: 1 },
  };

  const interactive = computeAdditiveFluxComponents(
    interactiveWithFidelity,
    0,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );
  const accurate = computeAdditiveFluxComponents(accurateWithFidelity, 0, { x: 0, y: 0, z: 1 }, kin as any);
  const accurateNoRingScatter = computeAdditiveFluxComponents(
    {
      ...accurateWithFidelity,
      star: {
        ...accurateWithFidelity.star,
        photometry: {
          ...accurateWithFidelity.star.photometry,
          ringScattering: {
            ...accurateWithFidelity.star.photometry!.ringScattering!,
            enabled: false,
          },
        },
      },
    },
    0,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );

  expect(interactive.fluxRingScatteringOnly).toBeGreaterThan(0);
  expect(accurate.fluxRingScatteringOnly).toBe(0);
  expect(accurate.fluxRingScatteringOnly).toBeCloseTo(accurateNoRingScatter.fluxRingScatteringOnly, 12);
});

it("anchors ring scattering to conjunction geometry instead of periapsis phase", () => {
  const system: SystemParams = {
    ...makeSystem(),
    planet: {
      ...makeSystem().planet,
      rings: { innerRadius: 0.14, outerRadius: 0.22, inclination: 0.4 },
    },
    star: {
      ...makeSystem().star,
      photometry: {
        ...makeSystem().star.photometry,
        ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
      },
    },
    dynamics: {
      fidelityProfile: "interactive",
      physicsFeatures: { nonSphericalFlux: true },
    },
  };
  const kin = {
    planetOrbit: system.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 0, y: 0, z: 1 },
  };

  const nearTransit = computeAdditiveFluxComponents(system, 0, { x: 0, y: 0, z: 1 }, kin as any);
  const sameGeometryDifferentEpoch = computeAdditiveFluxComponents(
    system,
    5,
    { x: 0, y: 0, z: 1 },
    kin as any,
  );

  expect(sameGeometryDifferentEpoch.fluxRingScatteringOnly).toBeCloseTo(
    nearTransit.fluxRingScatteringOnly,
    12,
  );
});

it("adds a bounded atmospheric refraction shoulder near limb contact", () => {
  const system: SystemParams = {
    ...makeSystem(),
    dynamics: {
      fidelityProfile: "accurate",
      physicsFeatures: { atmosphereRT: true },
    },
    star: {
      ...makeSystem().star,
      photometry: {
        ...makeSystem().star.photometry,
        atmosphereRT: {
          enabled: true,
          target: "planet",
          lambdaRefNm: 550,
          refraction: {
            enabled: true,
            amp: 0.0015,
            width: 0.03,
            chromaticSlope: 0.6,
          },
        },
        spectralBandpass: {
          enabled: true,
          lambdaNm: [450, 550, 750],
          weights: [0.25, 0.5, 0.25],
        },
      },
    },
  };

  const nearContact = computeAdditiveFluxComponents(system, 0, { x: 0, y: 0, z: 1 }, {
    planetOrbit: system.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 1.1, y: 0, z: 1 },
  } as any);
  const farAway = computeAdditiveFluxComponents(system, 0, { x: 0, y: 0, z: 1 }, {
    planetOrbit: system.planet.orbit as any,
    rBary: { x: 0, y: 0, z: 0 },
    rPlanetAbs: { x: 0, y: 0, z: 1 },
    planetSky: { x: 1.45, y: 0, z: 1 },
  } as any);

  expect(nearContact.fluxRefractionOnly).toBeGreaterThan(0);
  expect(nearContact.fluxRefractionOnly).toBeGreaterThan(farAway.fluxRefractionOnly);
  expect(farAway.fluxRefractionOnly).toBeGreaterThanOrEqual(0);
});
