import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { assertStepInputs } from "../../src/sim/validation/assertions";

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

describe("assertStepInputs additive composition", () => {
  it("requires an explicit higher-fidelity additive composition declaration when additive channels are active", () => {
    const params: SystemParams = {
      ...makeSystem(),
      star: {
        ...makeSystem().star,
        photometry: {
          ...makeSystem().star.photometry,
          forwardScattering: { ...makeSystem().star.photometry!.forwardScattering!, enabled: false },
        },
      },
      dynamics: {
        fidelityProfile: "accurate",
        physicsFeatures: { atmosphereRT: true, thermalEnergyBalance: true },
      },
    };

    expect(() => assertStepInputs(params, 0)).toThrow(/additiveComposition = "higher-fidelity-coupled"/i);
  });

  it("rejects atmosphere RT emission on the higher-fidelity path when a planet thermal phase channel is active", () => {
    const params: SystemParams = {
      ...makeSystem(),
      star: {
        ...makeSystem().star,
        photometry: {
          ...makeSystem().star.photometry,
          additiveComposition: "higher-fidelity-coupled",
          forwardScattering: { ...makeSystem().star.photometry!.forwardScattering!, enabled: false },
        },
      },
      dynamics: {
        fidelityProfile: "accurate",
        physicsFeatures: { atmosphereRT: true, thermalEnergyBalance: true },
      },
    };

    expect(() => assertStepInputs(params, 0)).toThrow(/atmosphereRT\.emission.*thermal phase channel/i);
  });

  it("rejects forward scattering on the higher-fidelity path when a reflected planet phase channel is active", () => {
    const params: SystemParams = {
      ...makeSystem(),
      star: {
        ...makeSystem().star,
        photometry: {
          ...makeSystem().star.photometry,
          additiveComposition: "higher-fidelity-coupled",
          atmosphereRT: {
            ...makeSystem().star.photometry!.atmosphereRT!,
            emission: { ...makeSystem().star.photometry!.atmosphereRT!.emission!, enabled: false },
          },
        },
      },
      dynamics: {
        fidelityProfile: "accurate",
        physicsFeatures: { atmosphereRT: true, thermalEnergyBalance: true },
      },
    };

    expect(() => assertStepInputs(params, 0)).toThrow(/forwardScattering.*reflected planet phase channel/i);
  });

  it("rejects ring scattering on the higher-fidelity path when a reflected planet phase channel is active", () => {
    const params: SystemParams = {
      ...makeSystem(),
      planet: {
        ...makeSystem().planet,
        rings: { innerRadius: 0.14, outerRadius: 0.22, inclination: 0.4 },
      },
      star: {
        ...makeSystem().star,
        photometry: {
          ...makeSystem().star.photometry,
          additiveComposition: "higher-fidelity-coupled",
          atmosphereRT: {
            ...makeSystem().star.photometry!.atmosphereRT!,
            emission: { ...makeSystem().star.photometry!.atmosphereRT!.emission!, enabled: false },
          },
          forwardScattering: { ...makeSystem().star.photometry!.forwardScattering!, enabled: false },
          ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
        },
      },
      dynamics: {
        fidelityProfile: "accurate",
        physicsFeatures: {
          atmosphereRT: true,
          thermalEnergyBalance: true,
          nonSphericalFlux: true,
        },
      },
    };

    expect(() => assertStepInputs(params, 0)).toThrow(/ringScattering.*reflected planet phase channel/i);
  });

  it("keeps the same additive combinations available on the interactive path", () => {
    const params: SystemParams = {
      ...makeSystem(),
      planet: {
        ...makeSystem().planet,
        rings: { innerRadius: 0.14, outerRadius: 0.22, inclination: 0.4 },
      },
      star: {
        ...makeSystem().star,
        photometry: {
          ...makeSystem().star.photometry,
          additiveComposition: "legacy-free-stacking",
          ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
        },
      },
      dynamics: {
        fidelityProfile: "interactive",
        physicsFeatures: {
          atmosphereRT: true,
          thermalEnergyBalance: true,
          nonSphericalFlux: true,
        },
      },
    };

    expect(() => assertStepInputs(params, 0)).not.toThrow();
  });
});
