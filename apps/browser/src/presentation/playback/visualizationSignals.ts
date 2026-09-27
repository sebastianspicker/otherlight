/** Connects visualization interactions to simulation and UI update signals. */
//
// Overlay series builders produce LightCurveOverlaySeries data
// from simulation runtimes, band variants, or sample arrays.

import type { SimulationFrame } from "../../domain/simulation/frames";
import type { LightCurveOverlaySeries } from "../render/lightCurve/lightCurvePlotTypes";

export function componentOverlaySeriesFromSamples(
  samples: Array<{ t: number; step: SimulationFrame }>,
): LightCurveOverlaySeries[] {
  const baseline: LightCurveOverlaySeries = {
    id: "stellar-baseline",
    label: "stellar baseline",
    color: "#6c757d",
    style: "dashed",
    alpha: 0.65,
    samples: [],
  };
  const transitOnly: LightCurveOverlaySeries = {
    id: "transit-only",
    label: "transit attenuation",
    color: "#8ecae6",
    style: "dotted",
    alpha: 0.78,
    samples: [],
  };
  const scatterShoulder: LightCurveOverlaySeries = {
    id: "scattering-shoulder",
    label: "scatter/refraction shoulder",
    color: "#ffb703",
    style: "solid",
    alpha: 0.82,
    samples: [],
  };
  for (const sample of samples) {
    const c = sample.step.renderSignals.fluxComponents;
    baseline.samples.push({ t: sample.t, flux: c.stellarPreTransit });
    transitOnly.samples.push({ t: sample.t, flux: c.stellarPreTransit * c.transitFactor });
    scatterShoulder.samples.push({
      t: sample.t,
      flux:
        c.stellarPreTransit * c.transitFactor +
        c.forwardScattering +
        c.ringScattering +
        (Number.isFinite(c.refraction) ? (c.refraction as number) : 0),
    });
  }
  return [baseline, transitOnly, scatterShoulder];
}
