import type { SystemParams } from "../core/types";
import type { InstrumentNoiseSystematicsParams } from "../core/instrumentNoiseTypes";
import { currentAirmass } from "../photometry/instrumentNoiseHelpers";
import type { SimulationStepV3 } from "../sim/v3/types";
import type {
  LightCurveBadge,
  LightCurveMarker,
  LightCurveOverlayPoint,
  LightCurveWindowOverlay,
} from "../render/lightCurvePlotTypes";
import { getInstrumentCfgFromPhotometry } from "./noise";

export function pushCappedOverlayPoint(
  history: LightCurveOverlayPoint[],
  sample: LightCurveOverlayPoint,
  capacity: number,
): void {
  history.push(sample);
  const excess = history.length - Math.max(16, capacity);
  if (excess > 0) history.splice(0, excess);
}

function addMarker(
  list: LightCurveMarker[],
  id: string,
  tSec: number | undefined,
  label: string,
  color: string,
  kind: LightCurveMarker["kind"],
  align: LightCurveMarker["align"] = "top",
): void {
  if (!Number.isFinite(tSec)) return;
  list.push({ id, tSec: tSec as number, label, color, kind, emphasized: kind !== "timing", align });
}

export function buildLightCurveMarkers(step: SimulationStepV3): LightCurveMarker[] {
  const markers: LightCurveMarker[] = [];
  addMarker(markers, "planet-ingress", step.timing?.planetIngressSec, "P ingress", "#8ecae6", "contact");
  addMarker(markers, "planet-mid", step.timing?.planetTransitCenterSec, "P mid", "#8ecae6", "event");
  addMarker(markers, "planet-egress", step.timing?.planetEgressSec, "P egress", "#8ecae6", "contact");
  addMarker(
    markers,
    "moon-ingress",
    step.timing?.moonIngressSec,
    "M ingress",
    "#adb5bd",
    "contact",
    "bottom",
  );
  addMarker(markers, "moon-mid", step.timing?.moonTransitCenterSec, "M mid", "#adb5bd", "event", "bottom");
  addMarker(markers, "moon-egress", step.timing?.moonEgressSec, "M egress", "#adb5bd", "contact", "bottom");
  for (const timing of step.renderSignals.timingMarkers) {
    if (!Number.isFinite(timing.seconds)) continue;
    if (
      timing.id === "planetTransitCenterSec" ||
      timing.id === "moonTransitCenterSec" ||
      timing.id === "planetTransitDurationSec" ||
      timing.id === "moonTransitDurationSec"
    ) {
      continue;
    }
    markers.push({
      id: timing.id,
      tSec: timing.seconds as number,
      label: timing.id
        .replace(/Sec$/, "")
        .replace(/([A-Z])/g, " $1")
        .trim(),
      color: "#ffd166",
      kind: "timing",
      align: "top",
    });
  }
  return markers;
}

export function buildGapWindowOverlays(
  cfg: InstrumentNoiseSystematicsParams["observer"],
  range?: { startSec: number; endSec: number },
): LightCurveWindowOverlay[] {
  if (!cfg?.enabled) return [];
  const gaps = cfg.dataGaps;
  if (!gaps?.enabled) return [];
  const overlays: LightCurveWindowOverlay[] = [];

  for (const [index, window] of (gaps.windowsSec ?? []).entries()) {
    const startSec = window.startSec;
    const endSec = window.endSec;
    if (
      !(Number.isFinite(startSec) && Number.isFinite(endSec) && (endSec as number) > (startSec as number))
    ) {
      continue;
    }
    overlays.push({
      id: `gap-window-${index}`,
      startSec: startSec as number,
      endSec: endSec as number,
      color: "rgba(239, 71, 111, 1)",
      alpha: 0.16,
      label: "gap",
    });
  }

  const periodic = gaps.periodic;
  if (
    range &&
    periodic?.enabled &&
    Number.isFinite(periodic.periodSec) &&
    (periodic.periodSec as number) > 0 &&
    Number.isFinite(periodic.gapDurationSec) &&
    (periodic.gapDurationSec as number) > 0
  ) {
    const periodSec = periodic.periodSec as number;
    const durationSec = periodic.gapDurationSec as number;
    const phaseSec = Number.isFinite(periodic.phaseSec) ? (periodic.phaseSec as number) : 0;
    let n = Math.floor((range.startSec - phaseSec) / periodSec) - 1;
    while (true) {
      const startSec = phaseSec + n * periodSec;
      const endSec = startSec + durationSec;
      if (startSec > range.endSec + periodSec) break;
      if (endSec >= range.startSec && startSec <= range.endSec) {
        overlays.push({
          id: `gap-periodic-${n}`,
          startSec,
          endSec,
          color: "rgba(239, 71, 111, 1)",
          alpha: 0.12,
          label: "periodic gap",
        });
      }
      n += 1;
    }
  }

  return overlays;
}

export function estimateMeasurementSigma(system: SystemParams, tSec: number): number | undefined {
  const inst = getInstrumentCfgFromPhotometry(system.star.photometry);
  if (!inst?.enabled) return undefined;

  let sigma2 = 0;
  if (inst.correlatedNoise?.enabled && Number.isFinite(inst.correlatedNoise.sigmaFlux)) {
    sigma2 += (inst.correlatedNoise.sigmaFlux as number) ** 2;
  }
  if (inst.readNoise?.enabled && Number.isFinite(inst.readNoise.sigmaElectrons)) {
    const denom = Math.max(
      1e-9,
      (inst.throughput ?? 1) * (inst.electronsPerUnitFlux ?? 1e6) * Math.max(1, inst.exposureSec ?? 1),
    );
    sigma2 += ((inst.readNoise.sigmaElectrons as number) / denom) ** 2;
  }
  const atmosphere = inst.observer?.enabled ? inst.observer.atmosphere : undefined;
  if (
    atmosphere?.enabled &&
    atmosphere.scintillation?.enabled &&
    Number.isFinite(atmosphere.scintillation.sigmaFlux)
  ) {
    const airmass = currentAirmass(atmosphere, tSec);
    const exposureSec = Math.max(1, inst.exposureSec ?? 1);
    const airmassExponent = Math.max(0, atmosphere.scintillation.airmassExponent ?? 1.5);
    const exposureExponent = Math.max(0, atmosphere.scintillation.exposureExponent ?? 0.5);
    const sigma =
      ((atmosphere.scintillation.sigmaFlux as number) * Math.max(1, airmass ** airmassExponent)) /
      Math.max(1, exposureSec ** exposureExponent);
    sigma2 += sigma * sigma;
  }
  return sigma2 > 0 ? Math.sqrt(sigma2) : undefined;
}

export function buildMeasurementBadges(
  system: SystemParams,
  step: SimulationStepV3,
  tSec: number,
): LightCurveBadge[] {
  const badges: LightCurveBadge[] = [];
  const inst = getInstrumentCfgFromPhotometry(system.star.photometry);
  const hasPlanetSideAtmosphere = Boolean(
    system.star.photometry?.atmosphereTransmission?.enabled || system.star.photometry?.atmosphereRT?.enabled,
  );
  if (!inst?.enabled) return badges;
  const atmosphere = inst.observer?.enabled ? inst.observer.atmosphere : undefined;
  if (hasPlanetSideAtmosphere) badges.push({ label: "planet-side atmosphere", color: "#cdb4db" });
  if (inst.observer?.dataGaps?.enabled) badges.push({ label: "observer gaps", color: "#ef476f" });
  if (inst.postprocess?.enabled && inst.postprocess.detrend?.enabled) {
    badges.push({ label: "detrending active", color: "#ffd166" });
  }
  if (atmosphere?.enabled) {
    badges.push({ label: "observer-side contamination", color: "#ef476f" });
    const air = currentAirmass(atmosphere, tSec);
    if (Number.isFinite(air) && air > 1.02)
      badges.push({ label: `airmass ${air.toFixed(2)}`, color: "#f4a261" });
    if (atmosphere.clouds?.enabled) badges.push({ label: "cloud extinction", color: "#f28482" });
    if (atmosphere.tellurics?.enabled) badges.push({ label: "telluric bias", color: "#ffb703" });
    if (atmosphere.scintillation?.enabled) badges.push({ label: "scintillation", color: "#8ecae6" });
    if (atmosphere.skyBackground?.enabled) badges.push({ label: "sky residuals", color: "#90be6d" });
  }
  const sigma = estimateMeasurementSigma(system, tSec);
  if (Number.isFinite(sigma) && (sigma as number) > 0) {
    badges.push({ label: `noise rms ~ ${(sigma as number).toExponential(1)}`, color: "#adb5bd" });
  }
  if (Number.isFinite(step.flux.refraction) && (step.flux.refraction as number) > 0) {
    badges.push({ label: "refraction shoulder", color: "#cdb4db" });
  }
  return badges;
}

export {
  componentOverlaySeriesFromSamples,
  buildBandVariantSystems,
  sampleBandOverlaySeries,
  buildComparisonInset,
  sampleSeriesFromRuntime,
} from "./visualizationSignals";

export { buildSceneDidacticOverlay, createGhostGeometry } from "./visualizationScene";
