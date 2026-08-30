/**
 * Owns scientific Browser Photometry Config support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type { PhotometryParams } from "../../model/types";
import type { EducationScenarioV4 } from "./types";

function isEnabledFeature(x: { enabled?: boolean } | undefined): boolean {
  return Boolean(x?.enabled);
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

function isFiniteNonZero(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x !== 0;
}

type StellarSurfaceConfig = NonNullable<PhotometryParams["stellarSurface"]>;
type AtmosphereRtConfig = NonNullable<PhotometryParams["atmosphereRT"]>;
type AtmosphereRtLayerConfig = NonNullable<NonNullable<AtmosphereRtConfig["layers"]>[number]>;
type AtmosphereRtCloudHazeConfig = NonNullable<AtmosphereRtConfig["cloudHaze"]>;

type TransmissionShapeBody = {
  id: string;
  shape?: { oblateness?: number };
  rings?: { outerRadius?: number };
};

export function collectScientificBrowserActiveAdditiveChannelIssues(
  photometry: PhotometryParams | undefined,
): string[] {
  if (!photometry) return [];
  const issues: string[] = [];
  if (isEnabledFeature(photometry.phaseCurve)) issues.push("photometry.phaseCurve");
  if (isEnabledFeature(photometry.moonPhaseCurve)) issues.push("photometry.moonPhaseCurve");
  if (isEnabledFeature(photometry.forwardScattering)) issues.push("photometry.forwardScattering");
  if (isEnabledFeature(photometry.ringScattering)) issues.push("photometry.ringScattering");
  return issues;
}

export function collectScientificBrowserAdditiveDeclarationIssues(
  photometry: PhotometryParams | undefined,
  additiveChannelIssues: string[],
): string[] {
  if (!photometry || additiveChannelIssues.length === 0) return [];

  if (photometry.additiveComposition === "higher-fidelity-coupled") return [];

  if (photometry.additiveComposition === "legacy-free-stacking") {
    return [
      'photometry.additiveComposition = "legacy-free-stacking" is not allowed when additive photometry surfaces are active in scientific-browser mode',
      ...additiveChannelIssues,
    ];
  }

  return [
    'photometry.additiveComposition must be explicitly set to "higher-fidelity-coupled" when additive photometry surfaces are active in scientific-browser mode',
    ...additiveChannelIssues,
  ];
}

export function collectScientificBrowserAdditiveExecutionIssues(config: EducationScenarioV4): string[] {
  const photometry = config.photometry;
  if (!photometry || photometry.additiveComposition !== "higher-fidelity-coupled") return [];
  const issues: string[] = [];
  if (isEnabledFeature(photometry.ringScattering)) {
    const firstPlanet = config.bodies.planets[0];
    const ringOuter = firstPlanet?.rings?.outerRadius;
    if (!(typeof ringOuter === "number" && Number.isFinite(ringOuter) && ringOuter > 0)) {
      issues.push(
        "photometry.ringScattering requires the first explicit planet body to define rings on the scientific-browser native path",
      );
    }
  }

  return issues;
}

export function collectScientificBrowserStellarSurfaceIssues(
  photometry: PhotometryParams | undefined,
): string[] {
  const surf = photometry?.stellarSurface;
  if (!surf?.enabled) return [];

  const issues: string[] = [];
  collectGranulationIssues(surf, issues);
  collectActivityCycleIssues(surf, issues);
  return issues;
}

function collectGranulationIssues(surf: StellarSurfaceConfig, issues: string[]): void {
  if (surf.granulationSigma !== undefined && !isFiniteNonNegative(surf.granulationSigma)) {
    issues.push("photometry.stellarSurface.granulationSigma must be finite and >= 0 when enabled");
  }
  if (surf.granulationTimescaleSec !== undefined) {
    collectExplicitGranulationTimescaleIssue(surf, issues);
    return;
  }
  if (isFinitePositive(surf.granulationSigma)) {
    issues.push(
      "photometry.stellarSurface.granulationTimescaleSec must be explicit and > 0 when granulationSigma > 0",
    );
  }
}

function collectExplicitGranulationTimescaleIssue(surf: StellarSurfaceConfig, issues: string[]): void {
  if (isFinitePositive(surf.granulationTimescaleSec)) return;
  issues.push("photometry.stellarSurface.granulationTimescaleSec must be finite and > 0 when enabled");
}

function collectActivityCycleIssues(surf: StellarSurfaceConfig, issues: string[]): void {
  if (surf.activityCycleAmp !== undefined && !Number.isFinite(surf.activityCycleAmp)) {
    issues.push("photometry.stellarSurface.activityCycleAmp must be finite when enabled");
  }
  if (surf.activityCyclePeriodSec !== undefined) {
    collectExplicitActivityCyclePeriodIssue(surf, issues);
    return;
  }
  if (isFiniteNonZero(surf.activityCycleAmp)) {
    issues.push(
      "photometry.stellarSurface.activityCyclePeriodSec must be explicit and > 0 when activityCycleAmp != 0",
    );
  }
}

function collectExplicitActivityCyclePeriodIssue(surf: StellarSurfaceConfig, issues: string[]): void {
  if (isFinitePositive(surf.activityCyclePeriodSec)) return;
  issues.push("photometry.stellarSurface.activityCyclePeriodSec must be finite and > 0 when enabled");
}

export function collectScientificBrowserTransmissionIssues(config: EducationScenarioV4): string[] {
  const phot = config.photometry;
  const transmissionEnabled =
    isEnabledFeature(phot?.atmosphereTransmission) || isEnabledFeature(phot?.atmosphereRT);
  if (!transmissionEnabled) return [];

  const issues: string[] = [];
  const transmissionTargets = collectTransmissionTargets(phot);
  collectMissingTransmissionTargetIssues(config, transmissionTargets, issues);
  collectMixedTransmissionShapeIssues(config.bodies.planets, "planet", issues);
  collectMixedTransmissionShapeIssues(config.bodies.moons, "moon", issues);
  return issues;
}

function collectTransmissionTargets(photometry: PhotometryParams | undefined): Array<"planet" | "moon"> {
  return [
    photometry?.atmosphereTransmission?.enabled ? photometry.atmosphereTransmission?.target : undefined,
    photometry?.atmosphereRT?.enabled ? photometry.atmosphereRT?.target : undefined,
  ].filter((target): target is "planet" | "moon" => target === "planet" || target === "moon");
}

function collectMissingTransmissionTargetIssues(
  config: EducationScenarioV4,
  transmissionTargets: Array<"planet" | "moon">,
  issues: string[],
): void {
  if (transmissionTargets.includes("planet") && config.bodies.planets.length === 0) {
    issues.push(
      "scientific-browser atmospheric transmission targets the planet but no explicit planet body is present",
    );
  }
  if (transmissionTargets.includes("moon") && config.bodies.moons.length === 0) {
    issues.push(
      "scientific-browser atmospheric transmission targets the moon but no explicit moon body is present",
    );
  }
}

function collectMixedTransmissionShapeIssues(
  bodies: TransmissionShapeBody[],
  kind: "planet" | "moon",
  issues: string[],
): void {
  for (const body of bodies) {
    collectMixedTransmissionBodyIssues(body, kind, issues);
  }
}

function collectMixedTransmissionBodyIssues(
  body: TransmissionShapeBody,
  kind: "planet" | "moon",
  issues: string[],
): void {
  const oblateness = body.shape?.oblateness;
  if (isFinitePositive(oblateness)) {
    issues.push(
      `${kind} "${body.id}" has shape.oblateness > 0, which would force mixed-shape atmospheric transmission in scientific-browser mode`,
    );
  }
  const ringOuter = body.rings?.outerRadius;
  if (!isFinitePositive(ringOuter)) return;
  issues.push(
    `${kind} "${body.id}" has rings, which would force mixed-shape atmospheric transmission in scientific-browser mode`,
  );
}

export function collectScientificBrowserUnsupportedTransmissionModelIssues(
  config: EducationScenarioV4,
): string[] {
  const phot = config.photometry;
  if (!isEnabledFeature(phot?.atmosphereTransmission)) return [];

  return [
    "photometry.atmosphereTransmission is not yet supported on the scientific-browser native path",
    "scientific-browser currently supports only the bounded atmosphereRT native path for transmission effects",
  ];
}

export function collectScientificBrowserUnsupportedRtFeatureIssues(config: EducationScenarioV4): string[] {
  const rt = config.photometry?.atmosphereRT;
  if (!rt?.enabled) return [];

  const issues: string[] = [];
  collectUnsupportedRtTopLevelFeatureIssues(rt, issues);
  collectUnsupportedRtCloudHazeFeatureIssues(rt.cloudHaze, issues);
  for (const [index, layer] of (rt.layers ?? []).entries()) {
    collectUnsupportedRtLayerFeatureIssues(layer, index, issues);
  }

  return issues;
}

const collectUnsupportedRtTopLevelFeatureIssues = (rt: AtmosphereRtConfig, issues: string[]): void => {
  if (Array.isArray(rt.temperatureProfileK) && rt.temperatureProfileK.length > 0) {
    issues.push(
      "photometry.atmosphereRT.temperatureProfileK is not yet supported on the scientific-browser native path",
    );
  }
  if (rt.scattering?.enabled) {
    issues.push(
      "photometry.atmosphereRT.scattering is not yet supported on the scientific-browser native path",
    );
  }
  if (rt.emission?.enabled) {
    issues.push(
      "photometry.atmosphereRT.emission is not yet supported on the scientific-browser native path",
    );
  }
};

const collectUnsupportedRtCloudHazeFeatureIssues = (
  cloudHaze: AtmosphereRtCloudHazeConfig | undefined,
  issues: string[],
): void => {
  if (cloudHaze?.enabled && isFiniteNonZero(cloudHaze.hazeSlope)) {
    issues.push(
      "photometry.atmosphereRT.cloudHaze.hazeSlope is not yet supported on the scientific-browser native path",
    );
  }
};

const collectUnsupportedRtLayerFeatureIssues = (
  layer: AtmosphereRtLayerConfig,
  index: number,
  issues: string[],
): void => {
  if (layer.temperatureK !== undefined) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].temperatureK is not yet supported on the scientific-browser native path`,
    );
  }
  if (isFiniteNonZero(layer.alpha)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].alpha is not yet supported on the scientific-browser native path`,
    );
  }
  if (isFiniteNonZero(layer.hazeSlope)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].hazeSlope is not yet supported on the scientific-browser native path`,
    );
  }
};

export function collectScientificBrowserRtInputIssues(config: EducationScenarioV4): string[] {
  const rt = config.photometry?.atmosphereRT;
  if (!rt?.enabled) return [];

  const issues: string[] = [];
  collectRtTargetInputIssues(rt, issues);
  collectRtReferenceWavelengthIssues(rt, issues);
  for (const [index, layer] of (rt.layers ?? []).entries()) {
    collectRtLayerInputIssues(layer, index, issues);
  }
  collectRtCloudHazeInputIssues(rt.cloudHaze, issues);
  return issues;
}

const collectRtTargetInputIssues = (rt: AtmosphereRtConfig, issues: string[]): void => {
  if (rt.target !== "planet" && rt.target !== "moon") {
    issues.push(
      'photometry.atmosphereRT.target must be explicitly "planet" or "moon" on the scientific-browser native path',
    );
  }
};

const collectRtReferenceWavelengthIssues = (rt: AtmosphereRtConfig, issues: string[]): void => {
  if (rt.lambdaRefNm !== undefined && !isFinitePositive(rt.lambdaRefNm)) {
    issues.push(
      "photometry.atmosphereRT.lambdaRefNm must be finite and > 0 on the scientific-browser native path",
    );
  }
};

const collectRtLayerInputIssues = (layer: AtmosphereRtLayerConfig, index: number, issues: string[]): void => {
  if (!isFinitePositive(layer.r0)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].r0 must be finite and > 0 on the scientific-browser native path`,
    );
  }
  if (!isFinitePositive(layer.H)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].H must be finite and > 0 on the scientific-browser native path`,
    );
  }
  if (!isFiniteNonNegative(layer.tau0)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].tau0 must be finite and >= 0 on the scientific-browser native path`,
    );
  }
  collectOptionalRtLayerInputIssues(layer, index, issues);
};

const collectOptionalRtLayerInputIssues = (
  layer: AtmosphereRtLayerConfig,
  index: number,
  issues: string[],
): void => {
  if (layer.cloudOpacity !== undefined && !isFiniteNonNegative(layer.cloudOpacity)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].cloudOpacity must be finite and >= 0 on the scientific-browser native path`,
    );
  }
  if (layer.alpha !== undefined && !Number.isFinite(layer.alpha)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].alpha must be finite on the scientific-browser native path`,
    );
  }
  if (layer.hazeSlope !== undefined && !Number.isFinite(layer.hazeSlope)) {
    issues.push(
      `photometry.atmosphereRT.layers[${index}].hazeSlope must be finite on the scientific-browser native path`,
    );
  }
};

const collectRtCloudHazeInputIssues = (
  cloudHaze: AtmosphereRtCloudHazeConfig | undefined,
  issues: string[],
): void => {
  if (!cloudHaze?.enabled) return;
  if (cloudHaze.cloudDeckTau !== undefined && !isFiniteNonNegative(cloudHaze.cloudDeckTau)) {
    issues.push(
      "photometry.atmosphereRT.cloudHaze.cloudDeckTau must be finite and >= 0 on the scientific-browser native path",
    );
  }
  if (cloudHaze.hazeTau !== undefined && !isFiniteNonNegative(cloudHaze.hazeTau)) {
    issues.push(
      "photometry.atmosphereRT.cloudHaze.hazeTau must be finite and >= 0 on the scientific-browser native path",
    );
  }
  if (cloudHaze.hazeSlope !== undefined && !Number.isFinite(cloudHaze.hazeSlope)) {
    issues.push(
      "photometry.atmosphereRT.cloudHaze.hazeSlope must be finite on the scientific-browser native path",
    );
  }
};

export function collectScientificBrowserRtLayerIssues(config: EducationScenarioV4): string[] {
  const rt = config.photometry?.atmosphereRT;
  if (!rt?.enabled) return [];

  const layers = Array.isArray(rt.layers) ? rt.layers : [];
  const validLayers = layers.filter(
    (layer) =>
      layer && isFinitePositive(layer.r0) && isFinitePositive(layer.H) && isFiniteNonNegative(layer.tau0),
  );
  if (validLayers.length > 0) return [];

  const issues = [
    "photometry.atmosphereRT requires at least one explicit valid attenuation layer on the scientific-browser native path",
  ];
  if (rt.cloudHaze?.enabled) {
    issues.push(
      "photometry.atmosphereRT.cloudHaze without any valid attenuation layer is not supported on the scientific-browser native path",
    );
  }
  return issues;
}
