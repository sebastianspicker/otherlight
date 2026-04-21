import { describe, expect, it } from "vitest";

import type { SimulationConfigV4 } from "../../src/sim/v4/types";
import { createSimulationV4 } from "../../src/sim/v4/runtime";

function baseCfg(): SimulationConfigV4 {
  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime", executionMode: "scientific-browser" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
        { id: "star-b", r: 1, m: 1, luminosityScale: 0 },
      ],
      planets: [
        {
          id: "planet-1",
          r: 0.3,
          m: 0.01,
          orbit: { a: 0.05, e: 0, inc: 0, Omega: 0, omega: 0, period: 8, t0: 0 },
          parentStarId: "star-a",
          parentSystem: "star",
        },
      ],
      moons: [],
    },
    orbits: {
      binary: { a: 3, e: 0, inc: 0, Omega: 0, omega: 0, period: 20, t0: 0 },
      hierarchy: [{ childId: "planet-1", parentId: "star-a", relation: "orbits" }],
    },
    photometry: { baselineFlux: 1 },
  };
}

function baseMoonCfg(): SimulationConfigV4 {
  return {
    version: "4",
    mode: "general-lab",
    runtime: { mode: "realtime", executionMode: "scientific-browser" },
    observer: { dir: { x: 1, y: 0, z: 0 } },
    bodies: {
      stars: [
        { id: "star-a", r: 1, m: 2, luminosityScale: 1 },
        { id: "star-b", r: 1, m: 1, luminosityScale: 0 },
      ],
      planets: [
        {
          id: "planet-1",
          r: 0.18,
          m: 0.01,
          orbit: { a: 0.05, e: 0, inc: 0, Omega: 0, omega: 0, period: 8, t0: 0 },
          parentStarId: "star-a",
          parentSystem: "star",
        },
      ],
      moons: [
        {
          id: "moon-1",
          r: 0.08,
          m: 0.001,
          orbit: { a: 0.02, e: 0, inc: 0, Omega: 0, omega: 0, period: 2, t0: 0 },
          parentPlanetId: "planet-1",
        },
      ],
    },
    orbits: {
      binary: { a: 3, e: 0, inc: 0, Omega: 0, omega: 0, period: 20, t0: 0 },
      hierarchy: [
        { childId: "planet-1", parentId: "star-a", relation: "orbits" },
        { childId: "moon-1", parentId: "planet-1", relation: "orbits" },
      ],
    },
    photometry: { baselineFlux: 1 },
  };
}

describe("v4 native atmosphere transmission", () => {
  it("reduces effective blocking for low-opacity RT layers", async () => {
    const opaque = baseCfg();
    const rt = baseCfg();
    rt.photometry = {
      ...rt.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
      },
    };

    const simOpaque = createSimulationV4(opaque);
    const simRt = createSimulationV4(rt);
    await simOpaque.prepare();
    await simRt.prepare();

    const fOpaque = simOpaque.step(0).flux.total;
    const fRt = simRt.step(0).flux.total;

    expect(fRt).toBeGreaterThanOrEqual(fOpaque);
  });

  it("applies supported gray layer cloud opacity on the scientific-browser native RT path", async () => {
    const base = baseCfg();
    const cloudy = baseCfg();
    base.photometry = {
      ...base.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
      },
    };
    cloudy.photometry = {
      ...cloudy.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4, cloudOpacity: 0.3 }],
      },
    };

    const simBase = createSimulationV4(base);
    const simCloudy = createSimulationV4(cloudy);
    await simBase.prepare();
    await simCloudy.prepare();

    const fBase = simBase.step(0).flux.total;
    const fCloudy = simCloudy.step(0).flux.total;

    expect(fCloudy).toBeLessThanOrEqual(fBase);
  });

  it("applies stronger attenuation for larger supported gray cloudOpacity on the scientific-browser native path", async () => {
    const lightCloud = baseCfg();
    const heavyCloud = baseCfg();
    lightCloud.photometry = {
      ...lightCloud.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4, cloudOpacity: 0.05 }],
      },
    };
    heavyCloud.photometry = {
      ...heavyCloud.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4, cloudOpacity: 0.3 }],
      },
    };

    const simLightCloud = createSimulationV4(lightCloud);
    const simHeavyCloud = createSimulationV4(heavyCloud);
    await simLightCloud.prepare();
    await simHeavyCloud.prepare();

    const fLightCloud = simLightCloud.step(0).flux.total;
    const fHeavyCloud = simHeavyCloud.step(0).flux.total;

    expect(fHeavyCloud).toBeLessThanOrEqual(fLightCloud);
  });

  it("applies supported gray cloud-haze opacity on the scientific-browser native RT path", async () => {
    const base = baseCfg();
    const hazy = baseCfg();
    base.photometry = {
      ...base.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
      },
    };
    hazy.photometry = {
      ...hazy.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0 },
      },
    };

    const simBase = createSimulationV4(base);
    const simHazy = createSimulationV4(hazy);
    await simBase.prepare();
    await simHazy.prepare();

    const fBase = simBase.step(0).flux.total;
    const fHazy = simHazy.step(0).flux.total;

    expect(fHazy).toBeLessThanOrEqual(fBase);
  });

  it("applies supported moon-target gray RT layers on the scientific-browser native path", async () => {
    const opaque = baseMoonCfg();
    const rtMoon = baseMoonCfg();
    rtMoon.photometry = {
      ...rtMoon.photometry,
      atmosphereRT: {
        enabled: true,
        target: "moon",
        layers: [{ r0: 0.08, H: 0.02, tau0: 1e-4 }],
      },
    };

    const simOpaque = createSimulationV4(opaque);
    const simRtMoon = createSimulationV4(rtMoon);
    await simOpaque.prepare();
    await simRtMoon.prepare();

    const fOpaque = simOpaque.step(0).flux.total;
    const fRtMoon = simRtMoon.step(0).flux.total;

    expect(fRtMoon).toBeGreaterThanOrEqual(fOpaque);
  });

  it("stacks supported gray RT layers on the scientific-browser native path", async () => {
    const singleLayer = baseCfg();
    const doubleLayer = baseCfg();
    singleLayer.photometry = {
      ...singleLayer.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
      },
    };
    doubleLayer.photometry = {
      ...doubleLayer.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [
          { r0: 0.3, H: 0.05, tau0: 1e-4 },
          { r0: 0.32, H: 0.04, tau0: 2e-4 },
        ],
      },
    };

    const simSingle = createSimulationV4(singleLayer);
    const simDouble = createSimulationV4(doubleLayer);
    await simSingle.prepare();
    await simDouble.prepare();

    const fSingle = simSingle.step(0).flux.total;
    const fDouble = simDouble.step(0).flux.total;

    expect(fDouble).toBeLessThanOrEqual(fSingle);
  });

  it("keeps supported gray RT invariant to layer order on the scientific-browser native path", async () => {
    const ordered = baseCfg();
    const reversed = baseCfg();
    ordered.photometry = {
      ...ordered.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [
          { r0: 0.28, H: 0.03, tau0: 4e-4, cloudOpacity: 0.02 },
          { r0: 0.31, H: 0.05, tau0: 2e-4, cloudOpacity: 0.01 },
        ],
      },
    };
    reversed.photometry = {
      ...reversed.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [
          { r0: 0.31, H: 0.05, tau0: 2e-4, cloudOpacity: 0.01 },
          { r0: 0.28, H: 0.03, tau0: 4e-4, cloudOpacity: 0.02 },
        ],
      },
    };

    const simOrdered = createSimulationV4(ordered);
    const simReversed = createSimulationV4(reversed);
    await simOrdered.prepare();
    await simReversed.prepare();

    const fOrdered = simOrdered.step(0).flux.total;
    const fReversed = simReversed.step(0).flux.total;

    expect(fOrdered).toBeCloseTo(fReversed, 12);
  });

  it("applies stronger attenuation for larger supported gray tau0 on the scientific-browser native path", async () => {
    const thin = baseCfg();
    const thick = baseCfg();
    thin.photometry = {
      ...thin.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
      },
    };
    thick.photometry = {
      ...thick.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 5e-2 }],
      },
    };

    const simThin = createSimulationV4(thin);
    const simThick = createSimulationV4(thick);
    await simThin.prepare();
    await simThick.prepare();

    const fThin = simThin.step(0).flux.total;
    const fThick = simThick.step(0).flux.total;

    expect(fThick).toBeLessThanOrEqual(fThin);
  });

  it("applies stronger attenuation for larger supported gray hazeTau on the scientific-browser native path", async () => {
    const lightHaze = baseCfg();
    const heavyHaze = baseCfg();
    lightHaze.photometry = {
      ...lightHaze.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.1, hazeTau: 0.05, hazeSlope: 0 },
      },
    };
    heavyHaze.photometry = {
      ...heavyHaze.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.1, hazeTau: 0.2, hazeSlope: 0 },
      },
    };

    const simLight = createSimulationV4(lightHaze);
    const simHeavy = createSimulationV4(heavyHaze);
    await simLight.prepare();
    await simHeavy.prepare();

    const fLight = simLight.step(0).flux.total;
    const fHeavy = simHeavy.step(0).flux.total;

    expect(fHeavy).toBeLessThanOrEqual(fLight);
  });

  it("applies stronger attenuation for larger supported gray cloudDeckTau on the scientific-browser native path", async () => {
    const lightDeck = baseCfg();
    const heavyDeck = baseCfg();
    lightDeck.photometry = {
      ...lightDeck.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.05, hazeTau: 0.1, hazeSlope: 0 },
      },
    };
    heavyDeck.photometry = {
      ...heavyDeck.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-4 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.2, hazeTau: 0.1, hazeSlope: 0 },
      },
    };

    const simLight = createSimulationV4(lightDeck);
    const simHeavy = createSimulationV4(heavyDeck);
    await simLight.prepare();
    await simHeavy.prepare();

    const fLight = simLight.step(0).flux.total;
    const fHeavy = simHeavy.step(0).flux.total;

    expect(fHeavy).toBeLessThanOrEqual(fLight);
  });

  it("applies stronger attenuation for larger supported gray H on the scientific-browser native path", async () => {
    const compact = baseCfg();
    const extended = baseCfg();
    compact.photometry = {
      ...compact.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.01, tau0: 1e-2 }],
      },
    };
    extended.photometry = {
      ...extended.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.3, H: 0.08, tau0: 1e-2 }],
      },
    };

    const simCompact = createSimulationV4(compact);
    const simExtended = createSimulationV4(extended);
    await simCompact.prepare();
    await simExtended.prepare();

    const fCompact = simCompact.step(0).flux.total;
    const fExtended = simExtended.step(0).flux.total;

    expect(fExtended).toBeLessThanOrEqual(fCompact);
  });

  it("keeps supported gray RT invariant to lambdaRefNm on the scientific-browser native path", async () => {
    const blueRef = baseCfg();
    const redRef = baseCfg();
    blueRef.photometry = {
      ...blueRef.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        lambdaRefNm: 450,
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-2 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.1, hazeTau: 0.05, hazeSlope: 0 },
      },
    };
    redRef.photometry = {
      ...redRef.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        lambdaRefNm: 900,
        layers: [{ r0: 0.3, H: 0.05, tau0: 1e-2 }],
        cloudHaze: { enabled: true, cloudDeckTau: 0.1, hazeTau: 0.05, hazeSlope: 0 },
      },
    };

    const simBlueRef = createSimulationV4(blueRef);
    const simRedRef = createSimulationV4(redRef);
    await simBlueRef.prepare();
    await simRedRef.prepare();

    const fBlueRef = simBlueRef.step(0).flux.total;
    const fRedRef = simRedRef.step(0).flux.total;

    expect(fBlueRef).toBeCloseTo(fRedRef, 12);
  });

  it("applies stronger attenuation for larger supported gray r0 on the scientific-browser native path", async () => {
    const lowerBase = baseCfg();
    const higherBase = baseCfg();
    lowerBase.photometry = {
      ...lowerBase.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.22, H: 0.05, tau0: 1e-2 }],
      },
    };
    higherBase.photometry = {
      ...higherBase.photometry,
      atmosphereRT: {
        enabled: true,
        target: "planet",
        layers: [{ r0: 0.29, H: 0.05, tau0: 1e-2 }],
      },
    };

    const simLowerBase = createSimulationV4(lowerBase);
    const simHigherBase = createSimulationV4(higherBase);
    await simLowerBase.prepare();
    await simHigherBase.prepare();

    const fLowerBase = simLowerBase.step(0).flux.total;
    const fHigherBase = simHigherBase.step(0).flux.total;

    expect(fHigherBase).toBeLessThanOrEqual(fLowerBase);
  });
});
