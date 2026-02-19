import { describe, expect, it } from "vitest";

import { buildOcCsv, fitLinearEphemeris, formatOcPanelStats } from "../../src/app/ocPlot";
import { createTransitHistoryState } from "../../src/app/transitHistory";

describe("oc plot helpers", () => {
  it("builds csv rows for selected body", () => {
    const state = createTransitHistoryState();
    state.planet.events.push({
      centerSec: 100,
      ocSec: 0.2,
      durationSec: 10,
      ingressSec: 95,
      egressSec: 105,
      detectedAtSec: 101,
    });
    const csv = buildOcCsv(state, "planet");
    expect(csv).toContain(
      "body,index,center_sec,oc_raw_sec,oc_fit_sec,oc_residual_sec,oc_display,duration_sec,ingress_sec,egress_sec,detected_at_sec,unit,trend_mode",
    );
    expect(csv).toContain("planet,0,100,0.2,,,0.2,10,95,105,101,s,raw");
  });

  it("formats panel stats with counts and metrics", () => {
    const state = createTransitHistoryState();
    state.moon.events.push({
      centerSec: 200,
      ocSec: -0.03,
      durationSec: 2,
      ingressSec: 199,
      egressSec: 201,
      detectedAtSec: 201,
    });
    state.moon.latestOcSec = -0.03;
    state.moon.rmsOcSec = 0.03;
    const text = formatOcPanelStats(state, "moon", { unit: "ms", trendMode: "fit" });
    expect(text).toContain("moon events=1");
    expect(text).toContain("latest=");
    expect(text).toContain("slope=");
  });

  it("fits linear ephemeris trend for O-C samples", () => {
    const fit = fitLinearEphemeris([
      { x: 0, y: 0.1 },
      { x: 10, y: 0.2 },
      { x: 20, y: 0.3 },
    ]);
    expect(fit).toBeDefined();
    expect(Math.abs((fit?.slope ?? 0) - 0.01)).toBeLessThan(1e-12);
    expect(Math.abs(fit?.rmsResidual ?? 1)).toBeLessThan(1e-12);
  });

  it("applies unit + trend options in csv export columns", () => {
    const state = createTransitHistoryState();
    state.planet.events.push(
      { centerSec: 100, ocSec: 0.1, detectedAtSec: 101 },
      { centerSec: 200, ocSec: 0.2, detectedAtSec: 201 },
    );
    const csv = buildOcCsv(state, "planet", { unit: "ms", trendMode: "detrended" });
    expect(csv).toContain(",ms,detrended");
    expect(csv).toContain("oc_residual_sec");
  });
});
