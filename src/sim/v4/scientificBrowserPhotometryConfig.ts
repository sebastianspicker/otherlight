import type { PhotometryParams } from "../../core/types";
import type { SimulationConfigV4 } from "./types";

function isEnabledFeature(x: { enabled?: boolean } | undefined): boolean {
  return Boolean(x?.enabled);
}

function isFinitePositive(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function isFiniteNonNegative(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

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

export function collectScientificBrowserAdditiveExecutionIssues(config: SimulationConfigV4): string[] {
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
  const hasFinitePositiveGranulationSigma =
    Number.isFinite(surf.granulationSigma) && (surf.granulationSigma as number) > 0;
  const hasFiniteNonZeroActivityAmp =
    Number.isFinite(surf.activityCycleAmp) && (surf.activityCycleAmp as number) !== 0;

  if (surf.granulationSigma !== undefined) {
    if (!Number.isFinite(surf.granulationSigma) || surf.granulationSigma < 0) {
      issues.push("photometry.stellarSurface.granulationSigma must be finite and >= 0 when enabled");
    }
  }
  if (surf.granulationTimescaleSec !== undefined) {
    if (!Number.isFinite(surf.granulationTimescaleSec) || surf.granulationTimescaleSec <= 0) {
      issues.push("photometry.stellarSurface.granulationTimescaleSec must be finite and > 0 when enabled");
    }
  } else if (hasFinitePositiveGranulationSigma) {
    issues.push(
      "photometry.stellarSurface.granulationTimescaleSec must be explicit and > 0 when granulationSigma > 0",
    );
  }

  if (surf.activityCycleAmp !== undefined) {
    if (!Number.isFinite(surf.activityCycleAmp)) {
      issues.push("photometry.stellarSurface.activityCycleAmp must be finite when enabled");
    }
  }
  if (surf.activityCyclePeriodSec !== undefined) {
    if (!Number.isFinite(surf.activityCyclePeriodSec) || surf.activityCyclePeriodSec <= 0) {
      issues.push("photometry.stellarSurface.activityCyclePeriodSec must be finite and > 0 when enabled");
    }
  } else if (hasFiniteNonZeroActivityAmp) {
    issues.push(
      "photometry.stellarSurface.activityCyclePeriodSec must be explicit and > 0 when activityCycleAmp != 0",
    );
  }

  return issues;
}

export function collectScientificBrowserTransmissionIssues(config: SimulationConfigV4): string[] {
  const phot = config.photometry;
  const transmissionEnabled =
    isEnabledFeature(phot?.atmosphereTransmission) || isEnabledFeature(phot?.atmosphereRT);
  if (!transmissionEnabled) return [];

  const issues: string[] = [];
  const transmissionTargets = [
    phot?.atmosphereTransmission?.enabled ? phot.atmosphereTransmission?.target : undefined,
    phot?.atmosphereRT?.enabled ? phot.atmosphereRT?.target : undefined,
  ].filter((target): target is "planet" | "moon" => target === "planet" || target === "moon");

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

  const checkBody = (
    body: { id: string; shape?: { oblateness?: number }; rings?: { outerRadius?: number } },
    kind: "planet" | "moon",
  ): void => {
    const oblateness = body.shape?.oblateness;
    if (typeof oblateness === "number" && Number.isFinite(oblateness) && oblateness > 0) {
      issues.push(
        `${kind} "${body.id}" has shape.oblateness > 0, which would force mixed-shape atmospheric transmission in scientific-browser mode`,
      );
    }
    const ringOuter = body.rings?.outerRadius;
    if (typeof ringOuter === "number" && Number.isFinite(ringOuter) && ringOuter > 0) {
      issues.push(
        `${kind} "${body.id}" has rings, which would force mixed-shape atmospheric transmission in scientific-browser mode`,
      );
    }
  };

  for (const planet of config.bodies.planets) checkBody(planet, "planet");
  for (const moon of config.bodies.moons) checkBody(moon, "moon");

  return issues;
}

export function collectScientificBrowserUnsupportedTransmissionModelIssues(
  config: SimulationConfigV4,
): string[] {
  const phot = config.photometry;
  if (!isEnabledFeature(phot?.atmosphereTransmission)) return [];

  return [
    "photometry.atmosphereTransmission is not yet supported on the scientific-browser native path",
    "scientific-browser currently supports only the bounded atmosphereRT native path for transmission effects",
  ];
}

export function collectScientificBrowserUnsupportedRtFeatureIssues(config: SimulationConfigV4): string[] {
  const rt = config.photometry?.atmosphereRT;
  if (!rt?.enabled) return [];

  const issues: string[] = [];

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
  if (
    rt.cloudHaze?.enabled &&
    Number.isFinite(rt.cloudHaze.hazeSlope) &&
    (rt.cloudHaze.hazeSlope as number) !== 0
  ) {
    issues.push(
      "photometry.atmosphereRT.cloudHaze.hazeSlope is not yet supported on the scientific-browser native path",
    );
  }

  for (const [index, layer] of (rt.layers ?? []).entries()) {
    if (layer.temperatureK !== undefined) {
      issues.push(
        `photometry.atmosphereRT.layers[${index}].temperatureK is not yet supported on the scientific-browser native path`,
      );
    }
    if (Number.isFinite(layer.alpha) && (layer.alpha as number) !== 0) {
      issues.push(
        `photometry.atmosphereRT.layers[${index}].alpha is not yet supported on the scientific-browser native path`,
      );
    }
    if (Number.isFinite(layer.hazeSlope) && (layer.hazeSlope as number) !== 0) {
      issues.push(
        `photometry.atmosphereRT.layers[${index}].hazeSlope is not yet supported on the scientific-browser native path`,
      );
    }
  }

  return issues;
}

export function collectScientificBrowserRtInputIssues(config: SimulationConfigV4): string[] {
  const rt = config.photometry?.atmosphereRT;
  if (!rt?.enabled) return [];

  const issues: string[] = [];

  if (rt.target !== "planet" && rt.target !== "moon") {
    issues.push(
      'photometry.atmosphereRT.target must be explicitly "planet" or "moon" on the scientific-browser native path',
    );
  }

  if (rt.lambdaRefNm !== undefined && !isFinitePositive(rt.lambdaRefNm)) {
    issues.push(
      "photometry.atmosphereRT.lambdaRefNm must be finite and > 0 on the scientific-browser native path",
    );
  }

  for (const [index, layer] of (rt.layers ?? []).entries()) {
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
  }

  if (rt.cloudHaze?.enabled) {
    if (rt.cloudHaze.cloudDeckTau !== undefined && !isFiniteNonNegative(rt.cloudHaze.cloudDeckTau)) {
      issues.push(
        "photometry.atmosphereRT.cloudHaze.cloudDeckTau must be finite and >= 0 on the scientific-browser native path",
      );
    }
    if (rt.cloudHaze.hazeTau !== undefined && !isFiniteNonNegative(rt.cloudHaze.hazeTau)) {
      issues.push(
        "photometry.atmosphereRT.cloudHaze.hazeTau must be finite and >= 0 on the scientific-browser native path",
      );
    }
    if (rt.cloudHaze.hazeSlope !== undefined && !Number.isFinite(rt.cloudHaze.hazeSlope)) {
      issues.push(
        "photometry.atmosphereRT.cloudHaze.hazeSlope must be finite on the scientific-browser native path",
      );
    }
  }

  return issues;
}

export function collectScientificBrowserRtLayerIssues(config: SimulationConfigV4): string[] {
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
