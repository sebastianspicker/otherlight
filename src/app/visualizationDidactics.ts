import { cloneParams } from "../core/clone";
import type { SystemParams } from "../core/types";
import type { InstrumentNoiseSystematicsParams } from "../core/instrumentNoiseTypes";
import { currentAirmass } from "../photometry/instrumentNoiseHelpers";
import { resolveWeightedPhotometryBands } from "../sim/v4/nativePhotometry";
import { createSimulationV4, migrateSystemParamsToV4 } from "../sim/v4";
import type { RenderOcculterGeometryV3, SimulationStepV3 } from "../sim/v3/types";
import type {
  LightCurveBadge,
  LightCurveComparisonInset,
  LightCurveMarker,
  LightCurveOverlayPoint,
  LightCurveOverlaySeries,
  LightCurveWindowOverlay,
} from "../render/lightCurvePlotTypes";
import type { SceneDidacticOverlayState, SceneGhostGeometry } from "../render/sceneTypes";
import { getInstrumentCfgFromPhotometry } from "./noise";

type RuntimeLike = {
  step: (tSec: number) => SimulationStepV3;
};

const BAND_COLORS = ["#ffb703", "#8ecae6", "#fb8500", "#90be6d", "#f28482"];

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

export function componentOverlaySeriesFromSamples(
  samples: Array<{ t: number; step: SimulationStepV3 }>,
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

export function buildBandVariantSystems(
  system: SystemParams,
): Array<{ label: string; color: string; system: SystemParams }> {
  const cfg = migrateSystemParamsToV4(system);
  const bands = resolveWeightedPhotometryBands(cfg);
  if (bands.length <= 1) return [];

  return bands.map((band, index) => {
    const clone = cloneParams(system);
    const phot = clone.star.photometry;
    if (phot?.spectralBandpass?.enabled && Array.isArray(phot.spectralBandpass.lambdaNm)) {
      const count = phot.spectralBandpass.lambdaNm.length;
      phot.spectralBandpass.weights = Array.from({ length: count }, (_, i) => (i === index ? 1 : 0));
    }
    if (phot?.atmosphereTransmission?.enabled && Array.isArray(phot.atmosphereTransmission.lambdaNm)) {
      const lambda = phot.atmosphereTransmission.lambdaNm[index];
      const tauScale = Array.isArray(phot.atmosphereTransmission.tauScale)
        ? phot.atmosphereTransmission.tauScale[index]
        : undefined;
      if (Number.isFinite(lambda)) phot.atmosphereTransmission.lambdaNm = [lambda as number];
      if (Number.isFinite(tauScale)) phot.atmosphereTransmission.tauScale = [tauScale as number];
    }
    return {
      label: `${Math.round(band.lambdaNm)} nm`,
      color: BAND_COLORS[index % BAND_COLORS.length],
      system: clone,
    };
  });
}

export function sampleBandOverlaySeries(args: {
  variants: Array<{ label: string; color: string; system: SystemParams }>;
  times: number[];
}): LightCurveOverlaySeries[] {
  const series: LightCurveOverlaySeries[] = [];
  for (const [index, variant] of args.variants.entries()) {
    const runtime = createSimulationV4(migrateSystemParamsToV4(variant.system));
    const samples: LightCurveOverlayPoint[] = [];
    for (const t of args.times) {
      const step = runtime.step(t);
      const flux = Number.isFinite(step.debug?.displayFluxValue)
        ? (step.debug?.displayFluxValue as number)
        : step.flux.total;
      samples.push({ t, flux });
    }
    series.push({
      id: `band-${index}`,
      label: variant.label,
      color: variant.color,
      style: "solid",
      width: 1.15,
      alpha: 0.75,
      samples,
    });
  }
  return series;
}

function detectOccultedPatchLabel(
  params: SystemParams,
  center: { x: number; y: number },
  radius: number,
): string[] {
  const patches = params.star.photometry?.brightnessPatches ?? [];
  const labels: string[] = [];
  for (const patch of patches) {
    if (!Number.isFinite(patch.x) || !Number.isFinite(patch.y)) continue;
    const d = Math.hypot((patch.x as number) - center.x, (patch.y as number) - center.y);
    const patchScale = Number.isFinite(patch.r)
      ? (patch.r as number)
      : Number.isFinite(patch.rx)
        ? Math.max(patch.rx as number, patch.ry ?? 0)
        : 0;
    if (!(d <= radius + Math.max(0, patchScale))) continue;
    const kind =
      Number.isFinite(patch.factor) && (patch.factor as number) < 1 ? "occulted spot" : "occulted facula";
    labels.push(kind);
  }
  return labels;
}

function bodyChordLine(
  geometry: RenderOcculterGeometryV3 | undefined,
  rStar: number,
  label: string,
  color: string,
): NonNullable<SceneDidacticOverlayState["lines"]>[number] | undefined {
  if (!geometry || !Number.isFinite(rStar) || rStar <= 0) return undefined;
  const y = geometry.center.y;
  if (!Number.isFinite(y) || Math.abs(y) >= rStar) return undefined;
  const x = Math.sqrt(Math.max(0, rStar * rStar - y * y));
  return {
    x1: -x,
    y1: y,
    x2: x,
    y2: y,
    color,
    label,
    dashed: true,
  };
}

export function buildSceneDidacticOverlay(args: {
  params: SystemParams;
  step: SimulationStepV3;
  tSec: number;
  ghosts?: SceneGhostGeometry[];
  extraBadges?: LightCurveBadge[];
}): SceneDidacticOverlayState {
  const { params, step, tSec, ghosts = [], extraBadges = [] } = args;
  const overlay: SceneDidacticOverlayState = { lines: [], points: [], badges: [], ghosts };
  const planet = step.renderSignals.occulterGeometry.find((item) => item.body === "planet");
  const moon = step.renderSignals.occulterGeometry.find((item) => item.body === "moon");
  const rStar = params.star.r;

  const planetChord = bodyChordLine(planet, rStar, "planet chord", "#8ecae6");
  if (planetChord) overlay.lines?.push(planetChord);
  const moonChord = bodyChordLine(moon, rStar, "moon chord", "#adb5bd");
  if (moonChord) overlay.lines?.push(moonChord);

  if (planetChord) {
    overlay.points?.push({ x: planetChord.x1, y: planetChord.y1, color: "#8ecae6", label: "P contact" });
    overlay.points?.push({ x: planetChord.x2, y: planetChord.y2, color: "#8ecae6" });
  }
  if (moonChord) {
    overlay.points?.push({ x: moonChord.x1, y: moonChord.y1, color: "#adb5bd", label: "M contact" });
    overlay.points?.push({ x: moonChord.x2, y: moonChord.y2, color: "#adb5bd" });
  }

  if (planet && planet.body === "planet") {
    for (const label of detectOccultedPatchLabel(
      params,
      planet.center,
      planet.kind === "circle"
        ? planet.radius
        : planet.kind === "ellipse"
          ? Math.max(planet.rx, planet.ry)
          : planet.outerRadius,
    )) {
      overlay.badges?.push({ label, color: "#f28482" });
    }
  }

  if (
    Number.isFinite(step.renderSignals.visibilityFractions.planet) &&
    (step.renderSignals.visibilityFractions.planet as number) < 0.999
  ) {
    overlay.badges?.push({
      label: `planet visible ${(step.renderSignals.visibilityFractions.planet as number).toFixed(2)}`,
      color: "#8ecae6",
    });
  }
  if (
    Number.isFinite(step.renderSignals.visibilityFractions.moon) &&
    (step.renderSignals.visibilityFractions.moon as number) < 0.999
  ) {
    overlay.badges?.push({
      label: `moon visible ${(step.renderSignals.visibilityFractions.moon as number).toFixed(2)}`,
      color: "#adb5bd",
    });
  }

  if (
    params.planet?.rings &&
    Number.isFinite(params.planet.rings.outerRadius) &&
    params.planet.rings.outerRadius > 0
  ) {
    overlay.badges?.push({ label: "ring orientation active", color: "#ffb703" });
  }
  if (
    params.star.photometry?.atmosphereTransmission?.enabled ||
    params.star.photometry?.atmosphereRT?.enabled
  ) {
    overlay.badges?.push({ label: "transmissive halo", color: "#cdb4db" });
  }

  const planetMass = params.planet?.m;
  const moonMass = params.moon?.m;
  if (
    params.moon &&
    planet &&
    moon &&
    Number.isFinite(planetMass) &&
    Number.isFinite(moonMass) &&
    (planetMass as number) > 0 &&
    (moonMass as number) > 0
  ) {
    const totalMass = (planetMass as number) + (moonMass as number);
    overlay.points?.push({
      x: (planet.center.x * (planetMass as number) + moon.center.x * (moonMass as number)) / totalMass,
      y: (planet.center.y * (planetMass as number) + moon.center.y * (moonMass as number)) / totalMass,
      color: "#ffd166",
      label: "barycenter",
    });
  }

  if (
    Number.isFinite(step.timing?.planetTransitCenterSec) &&
    Number.isFinite(step.timing?.moonTransitCenterSec)
  ) {
    const leadLagSec =
      (step.timing?.moonTransitCenterSec as number) - (step.timing?.planetTransitCenterSec as number);
    if (Math.abs(leadLagSec) > 1) {
      overlay.badges?.push({
        label:
          leadLagSec < 0
            ? `moon leads by ${Math.abs(leadLagSec).toFixed(0)} s`
            : `moon trails by ${Math.abs(leadLagSec).toFixed(0)} s`,
        color: "#ffd166",
      });
    }
  }
  if (planet && moon) {
    const planetRadius =
      planet.kind === "circle"
        ? planet.radius
        : planet.kind === "ellipse"
          ? Math.max(planet.rx, planet.ry)
          : planet.outerRadius;
    const moonRadius =
      moon.kind === "circle"
        ? moon.radius
        : moon.kind === "ellipse"
          ? Math.max(moon.rx, moon.ry)
          : moon.outerRadius;
    const separation = Math.hypot(planet.center.x - moon.center.x, planet.center.y - moon.center.y);
    if (separation < planetRadius + moonRadius) {
      overlay.badges?.push({ label: "mutual overlap", color: "#ffd166" });
    }
  }

  if (Number.isFinite(step.physicsDiagnostics.advancedTiming?.barycentricClockOffsetSec)) {
    overlay.badges?.push({
      label: `clock offset ${(step.physicsDiagnostics.advancedTiming?.barycentricClockOffsetSec as number).toFixed(0)} s`,
      color: "#ffb703",
    });
  }
  const advancedTiming = step.physicsDiagnostics.advancedTiming;
  const einsteinDelaySec = (advancedTiming?.einsteinPlanetSec ?? 0) + (advancedTiming?.einsteinMoonSec ?? 0);
  if (Number.isFinite(einsteinDelaySec) && Math.abs(einsteinDelaySec) > 0) {
    overlay.badges?.push({
      label: `Einstein delay ${einsteinDelaySec.toExponential(1)} s`,
      color: "#ffb703",
    });
  }
  if (step.physicsDiagnostics.closeEncounterFlags.length > 0) {
    overlay.badges?.push({ label: "close encounter warning", color: "#ef476f" });
  }

  for (const badge of extraBadges) overlay.badges?.push({ label: badge.label, color: badge.color });
  overlay.badges?.push({ label: `t=${tSec.toFixed(0)} s`, color: "#adb5bd" });
  return overlay;
}

export function createGhostGeometry(
  label: string,
  step: SimulationStepV3,
  color: string,
): SceneGhostGeometry {
  return {
    label,
    color,
    geometry: step.renderSignals.occulterGeometry.map((item) => ({ ...item })),
  };
}

export function buildComparisonInset(args: {
  a: LightCurveOverlaySeries | undefined;
  b: LightCurveOverlaySeries | undefined;
}): LightCurveComparisonInset | undefined {
  const { a, b } = args;
  if (!a || !b || a.samples.length === 0 || b.samples.length === 0) return undefined;
  const deltaSamples: LightCurveOverlayPoint[] = [];
  const count = Math.min(a.samples.length, b.samples.length);
  for (let i = 0; i < count; i++) {
    const sampleA = a.samples[i];
    const sampleB = b.samples[i];
    if (
      !(
        Number.isFinite(sampleA.t) &&
        Number.isFinite(sampleB.t) &&
        Number.isFinite(sampleA.flux) &&
        Number.isFinite(sampleB.flux)
      )
    ) {
      continue;
    }
    deltaSamples.push({ t: sampleA.t, flux: sampleB.flux - sampleA.flux });
  }
  return {
    title: "A/B delta",
    series: [{ label: "B-A", color: "#ffb703", samples: deltaSamples }],
  };
}

export function sampleSeriesFromRuntime(
  runtime: RuntimeLike,
  times: number[],
  label: string,
  color: string,
  fluxSelector: (step: SimulationStepV3) => number,
  style: LightCurveOverlaySeries["style"] = "solid",
): LightCurveOverlaySeries {
  return {
    id: label.toLowerCase().replace(/\s+/g, "-"),
    label,
    color,
    style,
    samples: times.map((t) => {
      const step = runtime.step(t);
      return { t, flux: fluxSelector(step) };
    }),
  };
}
