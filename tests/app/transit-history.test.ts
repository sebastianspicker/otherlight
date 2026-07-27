/** Verifies transit history contracts across app startup, controls, and runtime integration. */

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import {
  createTransitHistoryState,
  formatTransitHistorySummary,
  updateTransitHistoryFromStep,
} from "../../src/app/transitHistory";
import { fallbackStepV3 } from "../../src/app/frameLoopFallback";

function makeSystem(periodSec = 1000): SystemParams {
  return {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1 },
    planet: {
      r: 0.1,
      orbit: { a: 5, e: 0, inc: Math.PI / 2, Omega: 0, omega: 0, period: periodSec, t0: 0 },
    },
  };
}

describe("transit history state", () => {
  it("deduplicates repeated detections near the same center", () => {
    const state = createTransitHistoryState(16);
    const system = makeSystem(1000);

    const s1 = {
      tObsSec: 101,
      timing: { planetTransitCenterSec: 100, planetTtvSec: 0.2, planetTransitDurationSec: 10 },
    } as any;
    const s2 = {
      tObsSec: 101.2,
      timing: { planetTransitCenterSec: 100.1, planetTtvSec: 0.15, planetTransitDurationSec: 10.1 },
    } as any;

    expect(updateTransitHistoryFromStep({ state, step: s1, system, tNowSec: s1.tObsSec })).toBe(true);
    expect(updateTransitHistoryFromStep({ state, step: s2, system, tNowSec: s2.tObsSec })).toBe(false);
    expect(state.planet.events).toHaveLength(1);
    expect((state.planet.events[0].centerSec - 100.1) ** 2 < 1e-6).toBe(true);
  });

  it("tracks sequence O-C stats and formats summary", () => {
    const state = createTransitHistoryState(16);
    const system = makeSystem(1000);
    const samples = [
      { t: 101, c: 100, oc: 0.1 },
      { t: 1102, c: 1100, oc: -0.2 },
      { t: 2103, c: 2100, oc: 0.3 },
    ];

    for (const s of samples) {
      const step = { tObsSec: s.t, timing: { planetTransitCenterSec: s.c, planetTtvSec: s.oc } } as any;
      updateTransitHistoryFromStep({ state, step, system, tNowSec: s.t });
    }

    expect(state.planet.events).toHaveLength(3);
    expect(Number.isFinite(state.planet.rmsOcSec)).toBe(true);
    expect((state.planet.rmsOcSec ?? 0) > 0).toBe(true);
    expect(formatTransitHistorySummary(state)).toContain("planet n=3");
  });

  it("ignores future-center detections", () => {
    const state = createTransitHistoryState();
    const system = makeSystem(1000);
    const step = {
      tObsSec: 100,
      timing: { planetTransitCenterSec: 120, planetTtvSec: 0.5, planetTransitDurationSec: 10 },
    } as any;

    expect(updateTransitHistoryFromStep({ state, step, system, tNowSec: 100 })).toBe(false);
    expect(state.planet.events).toHaveLength(0);
  });

  it("does not update from fallback steps that reuse a previous valid step", () => {
    const state = createTransitHistoryState();
    const system = makeSystem(1000);
    const previous = fallbackStepV3(101, system);
    previous.timing = { planetTransitCenterSec: 100, planetTtvSec: 0.2, planetTransitDurationSec: 10 };
    const fallback = fallbackStepV3(200, system, previous);

    expect(updateTransitHistoryFromStep({ state, step: fallback, system, tNowSec: 200 })).toBe(false);
    expect(state.planet.events).toHaveLength(0);
    expect(fallback.renderSignals.uncertaintyFlags).toContain("fallback-step-used");
  });
});
