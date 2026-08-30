/**
 * Owns visualization Didactics support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { InstrumentNoiseSystematicsParams } from "../../domain/model/instrumentNoiseTypes";
import { currentAirmass } from "../../domain/photometry/instrumentNoiseHelpers";
import type { SimulationFrame } from "../../domain/simulation/frames";
import type {
  LightCurveBadge,
  LightCurveMarker,
  LightCurveOverlayPoint,
  LightCurveWindowOverlay,
} from "../render/lightCurvePlotTypes";
import { getInstrumentCfgFromPhotometry } from "../../application/noise";

type ObserverConfig = InstrumentNoiseSystematicsParams["observer"];
type DataGapsConfig = NonNullable<NonNullable<ObserverConfig>["dataGaps"]>;
type DataGapWindowConfig = NonNullable<DataGapsConfig["windowsSec"]>[number];
type PeriodicGapConfig = NonNullable<DataGapsConfig["periodic"]>;
type InstrumentConfig = InstrumentNoiseSystematicsParams;
type ObserverAtmosphereConfig = NonNullable<NonNullable<ObserverConfig>["atmosphere"]>;
type ScintillationConfig = NonNullable<ObserverAtmosphereConfig["scintillation"]>;

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

export function buildLightCurveMarkers(step: SimulationFrame): LightCurveMarker[] {
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
  return [...explicitGapWindowOverlays(gaps), ...periodicGapWindowOverlays(gaps.periodic, range)];
}

function finiteWindow(window: DataGapWindowConfig): { startSec: number; endSec: number } | undefined {
  const startSec = window.startSec;
  const endSec = window.endSec;
  if (!(Number.isFinite(startSec) && Number.isFinite(endSec) && (endSec as number) > (startSec as number))) {
    return undefined;
  }
  return { startSec: startSec as number, endSec: endSec as number };
}

function explicitGapWindowOverlays(gaps: DataGapsConfig): LightCurveWindowOverlay[] {
  const overlays: LightCurveWindowOverlay[] = [];
  for (const [index, window] of (gaps.windowsSec ?? []).entries()) {
    const finite = finiteWindow(window);
    if (!finite) continue;
    overlays.push({
      id: `gap-window-${index}`,
      startSec: finite.startSec,
      endSec: finite.endSec,
      color: "rgba(239, 71, 111, 1)",
      alpha: 0.16,
      label: "gap",
    });
  }
  return overlays;
}

function finitePeriodicGap(
  periodic: PeriodicGapConfig | undefined,
): { periodSec: number; durationSec: number; phaseSec: number } | undefined {
  if (!periodic?.enabled) return undefined;
  if (!(Number.isFinite(periodic.periodSec) && (periodic.periodSec as number) > 0)) return undefined;
  if (!(Number.isFinite(periodic.gapDurationSec) && (periodic.gapDurationSec as number) > 0))
    return undefined;
  return {
    periodSec: periodic.periodSec as number,
    durationSec: periodic.gapDurationSec as number,
    phaseSec: Number.isFinite(periodic.phaseSec) ? (periodic.phaseSec as number) : 0,
  };
}

function periodicGapWindowOverlays(
  periodic: PeriodicGapConfig | undefined,
  range?: { startSec: number; endSec: number },
): LightCurveWindowOverlay[] {
  const config = finitePeriodicGap(periodic);
  if (!range || !config) return [];

  const overlays: LightCurveWindowOverlay[] = [];
  let n = Math.floor((range.startSec - config.phaseSec) / config.periodSec) - 1;
  while (true) {
    const startSec = config.phaseSec + n * config.periodSec;
    const endSec = startSec + config.durationSec;
    if (startSec > range.endSec + config.periodSec) break;
    if (endSec >= range.startSec && startSec <= range.endSec) {
      overlays.push(periodicGapOverlay(n, startSec, endSec));
    }
    n += 1;
  }
  return overlays;
}

const periodicGapOverlay = (n: number, startSec: number, endSec: number): LightCurveWindowOverlay => {
  return {
    id: `gap-periodic-${n}`,
    startSec,
    endSec,
    color: "rgba(239, 71, 111, 1)",
    alpha: 0.12,
    label: "periodic gap",
  };
};

const correlatedNoiseVariance = (inst: InstrumentConfig): number => {
  if (!inst.correlatedNoise?.enabled || !Number.isFinite(inst.correlatedNoise.sigmaFlux)) return 0;
  return (inst.correlatedNoise.sigmaFlux as number) ** 2;
};

const readNoiseDenominator = (inst: InstrumentConfig): number => {
  return Math.max(
    1e-9,
    (inst.throughput ?? 1) * (inst.electronsPerUnitFlux ?? 1e6) * Math.max(1, inst.exposureSec ?? 1),
  );
};

const readNoiseVariance = (inst: InstrumentConfig): number => {
  if (!inst.readNoise?.enabled || !Number.isFinite(inst.readNoise.sigmaElectrons)) return 0;
  return ((inst.readNoise.sigmaElectrons as number) / readNoiseDenominator(inst)) ** 2;
};

const observerAtmosphere = (inst: InstrumentConfig): ObserverAtmosphereConfig | undefined => {
  return inst.observer?.enabled ? inst.observer.atmosphere : undefined;
};

const activeScintillationConfig = (
  atmosphere: ObserverAtmosphereConfig | undefined,
): ScintillationConfig | undefined => {
  if (!atmosphere?.enabled) return undefined;
  return atmosphere.scintillation?.enabled ? atmosphere.scintillation : undefined;
};

const finiteScintillationSigma = (scintillation: ScintillationConfig | undefined): number | undefined => {
  return Number.isFinite(scintillation?.sigmaFlux) ? (scintillation?.sigmaFlux as number) : undefined;
};

const scintillationScale = (
  atmosphere: ObserverAtmosphereConfig,
  inst: InstrumentConfig,
  tSec: number,
): number => {
  const scintillation = atmosphere.scintillation;
  const airmass = currentAirmass(atmosphere, tSec);
  const exposureSec = Math.max(1, inst.exposureSec ?? 1);
  const airmassExponent = Math.max(0, scintillation?.airmassExponent ?? 1.5);
  const exposureExponent = Math.max(0, scintillation?.exposureExponent ?? 0.5);
  return Math.max(1, airmass ** airmassExponent) / Math.max(1, exposureSec ** exposureExponent);
};

const scintillationVariance = (inst: InstrumentConfig, tSec: number): number => {
  const atmosphere = observerAtmosphere(inst);
  const sigmaFlux = finiteScintillationSigma(activeScintillationConfig(atmosphere));
  if (!atmosphere || sigmaFlux === undefined) return 0;

  const sigma = sigmaFlux * scintillationScale(atmosphere, inst, tSec);
  return sigma * sigma;
};

export function estimateMeasurementSigma(system: BrowserScenarioDraft, tSec: number): number | undefined {
  const inst = getInstrumentCfgFromPhotometry(system.star.photometry);
  if (!inst?.enabled) return undefined;

  const sigma2 = correlatedNoiseVariance(inst) + readNoiseVariance(inst) + scintillationVariance(inst, tSec);
  return sigma2 > 0 ? Math.sqrt(sigma2) : undefined;
}

const hasPlanetSideAtmosphere = (system: BrowserScenarioDraft): boolean => {
  return Boolean(
    system.star.photometry?.atmosphereTransmission?.enabled || system.star.photometry?.atmosphereRT?.enabled,
  );
};

const pushInstrumentBadges = (
  badges: LightCurveBadge[],
  system: BrowserScenarioDraft,
  inst: InstrumentConfig,
): void => {
  if (hasPlanetSideAtmosphere(system)) badges.push({ label: "planet-side atmosphere", color: "#cdb4db" });
  if (inst.observer?.dataGaps?.enabled) badges.push({ label: "observer gaps", color: "#ef476f" });
  if (inst.postprocess?.enabled && inst.postprocess.detrend?.enabled) {
    badges.push({ label: "detrending active", color: "#ffd166" });
  }
};

const pushAirmassBadge = (
  badges: LightCurveBadge[],
  atmosphere: ObserverAtmosphereConfig,
  tSec: number,
): void => {
  const air = currentAirmass(atmosphere, tSec);
  if (Number.isFinite(air) && air > 1.02) {
    badges.push({ label: `airmass ${air.toFixed(2)}`, color: "#f4a261" });
  }
};

const pushAtmosphereBadges = (
  badges: LightCurveBadge[],
  atmosphere: ObserverAtmosphereConfig | undefined,
  tSec: number,
): void => {
  if (!atmosphere?.enabled) return;
  badges.push({ label: "observer-side contamination", color: "#ef476f" });
  pushAirmassBadge(badges, atmosphere, tSec);
  if (atmosphere.clouds?.enabled) badges.push({ label: "cloud extinction", color: "#f28482" });
  if (atmosphere.tellurics?.enabled) badges.push({ label: "telluric bias", color: "#ffb703" });
  if (atmosphere.scintillation?.enabled) badges.push({ label: "scintillation", color: "#8ecae6" });
  if (atmosphere.skyBackground?.enabled) badges.push({ label: "sky residuals", color: "#90be6d" });
};

const pushNoiseBadge = (badges: LightCurveBadge[], system: BrowserScenarioDraft, tSec: number): void => {
  const sigma = estimateMeasurementSigma(system, tSec);
  if (Number.isFinite(sigma) && (sigma as number) > 0) {
    badges.push({ label: `noise rms ~ ${(sigma as number).toExponential(1)}`, color: "#adb5bd" });
  }
};

const pushRefractionBadge = (badges: LightCurveBadge[], step: SimulationFrame): void => {
  if (Number.isFinite(step.flux.refraction) && (step.flux.refraction as number) > 0) {
    badges.push({ label: "refraction shoulder", color: "#cdb4db" });
  }
};

export function buildMeasurementBadges(
  system: BrowserScenarioDraft,
  step: SimulationFrame,
  tSec: number,
): LightCurveBadge[] {
  const badges: LightCurveBadge[] = [];
  const inst = getInstrumentCfgFromPhotometry(system.star.photometry);
  if (!inst?.enabled) return badges;
  pushInstrumentBadges(badges, system, inst);
  pushAtmosphereBadges(badges, observerAtmosphere(inst), tSec);
  pushNoiseBadge(badges, system, tSec);
  pushRefractionBadge(badges, step);
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
