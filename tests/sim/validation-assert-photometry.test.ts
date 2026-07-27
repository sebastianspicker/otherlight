/** Verifies validation assert photometry contracts across system state, transit observables, and V4 integration. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { assertPhotometryInputs } from "../../src/sim/validation/assertPhotometry";

function baseParams(): SystemParams {
  return {
    star: { r: 7e8, m: 2e30 },
    planet: {
      r: 7e7,
      m: 1.9e27,
      orbit: { a: 1e11, e: 0.01, inc: 1.5, Omega: 0, omega: 0, period: 3e6, t0: 0 },
    },
  } as unknown as SystemParams;
}

function withPhot(params: SystemParams, phot: Record<string, unknown>): SystemParams {
  return { ...params, star: { ...params.star, photometry: phot } } as SystemParams;
}

describe("assertPhotometryInputs: basic field validation", () => {
  it("passes for params without photometry", () => {
    expect(() => assertPhotometryInputs(baseParams())).not.toThrow();
  });

  it("throws for non-positive gridRes", () => {
    expect(() => assertPhotometryInputs(withPhot(baseParams(), { gridRes: 0 }))).toThrow(/gridRes/i);
  });

  it("throws for negative baselineFlux", () => {
    expect(() => assertPhotometryInputs(withPhot(baseParams(), { baselineFlux: -1 }))).toThrow(
      /baselineFlux/i,
    );
  });

  it("throws for negative cadenceSec", () => {
    expect(() => assertPhotometryInputs(withPhot(baseParams(), { cadenceSec: -0.1 }))).toThrow(/cadenceSec/i);
  });

  it("throws for nSubsamples < 1", () => {
    expect(() => assertPhotometryInputs(withPhot(baseParams(), { nSubsamples: 0 }))).toThrow(/nSubsamples/i);
  });

  it("accepts valid basic photometry fields", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { gridRes: 64, baselineFlux: 1, cadenceSec: 120, nSubsamples: 5 }),
      ),
    ).not.toThrow();
  });
});

describe("assertPhotometryInputs: thermalInertia validation", () => {
  it("throws for phaseCurve thermalInertia albedo out of range", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          phaseCurve: { enabled: true, thermalInertia: { enabled: true, albedo: 1.5 } },
        }),
      ),
    ).toThrow(/albedo/i);
  });

  it("throws for phaseCurve thermalInertia emissivity out of range", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          phaseCurve: { enabled: true, thermalInertia: { enabled: true, emissivity: -0.1 } },
        }),
      ),
    ).toThrow(/emissivity/i);
  });

  it("throws for phaseCurve thermalInertia thermalTimescaleSec < 0", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          phaseCurve: { enabled: true, thermalInertia: { enabled: true, thermalTimescaleSec: -1 } },
        }),
      ),
    ).toThrow(/thermalTimescaleSec/i);
  });

  it("throws for phaseCurve thermalInertia redistribution out of range", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          phaseCurve: { enabled: true, thermalInertia: { enabled: true, redistribution: 2 } },
        }),
      ),
    ).toThrow(/redistribution/i);
  });

  it("skips thermalInertia checks when not enabled", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          phaseCurve: { enabled: true, thermalInertia: { enabled: false, albedo: 5 } },
        }),
      ),
    ).not.toThrow();
  });
});

describe("assertPhotometryInputs: spotEvolution validation", () => {
  it("throws when spotEvolution enabled without rotationPeriodSec", () => {
    expect(() =>
      assertPhotometryInputs(withPhot(baseParams(), { spotEvolution: { enabled: true } })),
    ).toThrow(/rotationPeriodSec/i);
  });

  it("throws for coverage out of range", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { spotEvolution: { enabled: true, rotationPeriodSec: 1e6, coverage: 1.5 } }),
      ),
    ).toThrow(/coverage/i);
  });

  it("throws for negative lifetimeSec", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { spotEvolution: { enabled: true, rotationPeriodSec: 1e6, lifetimeSec: -1 } }),
      ),
    ).toThrow(/lifetimeSec/i);
  });

  it("throws for NaN driftRateRadPerSec", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          spotEvolution: { enabled: true, rotationPeriodSec: 1e6, driftRateRadPerSec: NaN },
        }),
      ),
    ).toThrow(/driftRateRadPerSec/i);
  });

  it("accepts valid spotEvolution", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          spotEvolution: {
            enabled: true,
            rotationPeriodSec: 1e6,
            coverage: 0.1,
            lifetimeSec: 1e7,
            driftRateRadPerSec: 0.001,
            tRef: 0,
            rotationPhase0: 0,
          },
        }),
      ),
    ).not.toThrow();
  });
});

describe("assertPhotometryInputs: stellarSurface validation", () => {
  it("throws for differentialRotationK out of range", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { stellarSurface: { enabled: true, differentialRotationK: 1.5 } }),
      ),
    ).toThrow(/differentialRotationK/i);
  });

  it("throws for non-positive rotationPeriodSec", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { stellarSurface: { enabled: true, rotationPeriodSec: 0 } }),
      ),
    ).toThrow(/rotationPeriodSec/i);
  });
});

describe("assertPhotometryInputs: spectralBandpass validation", () => {
  it("throws for non-positive lambda entry", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { spectralBandpass: { enabled: true, lambdaNm: [550, -10] } }),
      ),
    ).toThrow(/lambdaNm/i);
  });

  it("throws for negative weight entry", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          spectralBandpass: { enabled: true, lambdaNm: [550, 600], weights: [0.5, -0.1] },
        }),
      ),
    ).toThrow(/weights/i);
  });

  it("throws for mismatched weights length", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          spectralBandpass: { enabled: true, lambdaNm: [550, 600], weights: [0.5] },
        }),
      ),
    ).toThrow(/weights.*length|length.*weights/i);
  });

  it("accepts valid bandpass without weights", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { spectralBandpass: { enabled: true, lambdaNm: [550, 600] } }),
      ),
    ).not.toThrow();
  });
});

describe("assertPhotometryInputs: atmosphereRT validation", () => {
  it("throws for non-positive lambdaRefNm", () => {
    expect(() =>
      assertPhotometryInputs(withPhot(baseParams(), { atmosphereRT: { enabled: true, lambdaRefNm: 0 } })),
    ).toThrow(/lambdaRefNm/i);
  });

  it("throws for layer with non-positive r0", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          atmosphereRT: { enabled: true, layers: [{ r0: 0, H: 1e5, tau0: 0.1 }] },
        }),
      ),
    ).toThrow(/r0/i);
  });

  it("throws for layer with non-positive H", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          atmosphereRT: { enabled: true, layers: [{ r0: 7e7, H: 0, tau0: 0.1 }] },
        }),
      ),
    ).toThrow(/\.H/i);
  });

  it("throws for layer with negative tau0", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          atmosphereRT: { enabled: true, layers: [{ r0: 7e7, H: 1e5, tau0: -0.1 }] },
        }),
      ),
    ).toThrow(/tau0/i);
  });

  it("throws for NaN layer alpha", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), {
          atmosphereRT: { enabled: true, layers: [{ r0: 7e7, H: 1e5, tau0: 0.1, alpha: NaN }] },
        }),
      ),
    ).toThrow(/alpha/i);
  });
});

describe("assertPhotometryInputs: thermalModelAdvanced validation", () => {
  it("throws for negative equilibriumScale", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { thermalModelAdvanced: { enabled: true, equilibriumScale: -1 } }),
      ),
    ).toThrow(/equilibriumScale/i);
  });

  it("throws for redistribution out of range", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { thermalModelAdvanced: { enabled: true, redistribution: 1.5 } }),
      ),
    ).toThrow(/redistribution/i);
  });

  it("throws for negative tauSec", () => {
    expect(() =>
      assertPhotometryInputs(withPhot(baseParams(), { thermalModelAdvanced: { enabled: true, tauSec: -1 } })),
    ).toThrow(/tauSec/i);
  });
});

describe("assertPhotometryInputs: ringScattering validation", () => {
  it("throws for negative amp", () => {
    expect(() =>
      assertPhotometryInputs(withPhot(baseParams(), { ringScattering: { enabled: true, amp: -1 } })),
    ).toThrow(/amp/i);
  });

  it("throws for non-positive sigmaPhase", () => {
    expect(() =>
      assertPhotometryInputs(
        withPhot(baseParams(), { ringScattering: { enabled: true, amp: 1, sigmaPhase: 0 } }),
      ),
    ).toThrow(/sigmaPhase/i);
  });
});

describe("assertPhotometryInputs: higher-fidelity additive composition", () => {
  function accurateParams(): SystemParams {
    return withPhot(baseParams(), {
      phaseCurve: { enabled: true, reflAmp: 0.1 },
    }) as SystemParams & {
      dynamics: { fidelityProfile: "accurate" };
    };
  }

  it("throws when active channels but additiveComposition is not higher-fidelity-coupled", () => {
    const p = {
      ...accurateParams(),
      dynamics: { fidelityProfile: "accurate" },
    } as unknown as SystemParams;
    expect(() => assertPhotometryInputs(p)).toThrow(/higher-fidelity/i);
  });

  it("passes when additiveComposition is higher-fidelity-coupled", () => {
    const p = {
      ...accurateParams(),
      dynamics: { fidelityProfile: "accurate" },
      star: {
        ...accurateParams().star,
        photometry: {
          phaseCurve: { enabled: true, reflAmp: 0.1 },
          additiveComposition: "higher-fidelity-coupled",
        },
      },
    } as unknown as SystemParams;
    expect(() => assertPhotometryInputs(p)).not.toThrow();
  });

  it("throws when atmosphereRT emission conflicts with planet thermal phase", () => {
    const p = {
      ...baseParams(),
      dynamics: { fidelityProfile: "accurate" },
      star: {
        ...baseParams().star,
        photometry: {
          additiveComposition: "higher-fidelity-coupled",
          atmosphereRT: {
            enabled: true,
            target: "planet",
            emission: { enabled: true, amp: 0.05 },
          },
          phaseCurve: { enabled: true, thermAmp: 0.1 },
        },
      },
    } as unknown as SystemParams;
    expect(() => assertPhotometryInputs(p)).toThrow(/emission.*thermal|thermal.*emission/i);
  });

  it("throws when forwardScattering conflicts with reflected phase", () => {
    const p = {
      ...baseParams(),
      dynamics: { fidelityProfile: "accurate" },
      star: {
        ...baseParams().star,
        photometry: {
          additiveComposition: "higher-fidelity-coupled",
          forwardScattering: { enabled: true, amp: 0.1 },
          phaseCurve: { enabled: true, reflAmp: 0.1 },
        },
      },
    } as unknown as SystemParams;
    expect(() => assertPhotometryInputs(p)).toThrow(/forwardScattering.*reflected|reflected.*phase/i);
  });
});
