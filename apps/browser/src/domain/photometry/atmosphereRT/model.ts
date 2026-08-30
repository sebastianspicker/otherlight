/**
 * Owns model support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { AtmosphereRTLayer, AtmosphereRTParams } from "../../model/types";
import { gaussianFeatureStrength } from "./gaussianFeatures";
import { finiteOr } from "./numeric";

/** Buffer factor for the outer shell boundary; ensures the sampling grid outer edge is outside the body. */
const SHELL_OUTER_BUFFER_FACTOR = 1.000001;

function hasValidLayerScale(layer: AtmosphereRTLayer): boolean {
  return Number.isFinite(layer.r0) && layer.r0 > 0 && Number.isFinite(layer.H) && layer.H > 0;
}

function hasValidLayerOpacity(layer: AtmosphereRTLayer): boolean {
  return Number.isFinite(layer.tau0) && layer.tau0 >= 0;
}

function isValidAtmosphereLayer(layer: AtmosphereRTLayer | undefined): layer is AtmosphereRTLayer {
  return (
    Boolean(layer) &&
    hasValidLayerScale(layer as AtmosphereRTLayer) &&
    hasValidLayerOpacity(layer as AtmosphereRTLayer)
  );
}

function wavelengthScale(params: {
  lambdaNm?: number;
  lambdaRefNm?: number;
  alpha: number;
  hazeSlope: number;
}): number {
  const wl = finiteOr(params.lambdaNm, finiteOr(params.lambdaRefNm, 550));
  const wlRef = Math.max(1e-6, finiteOr(params.lambdaRefNm, 550));
  return Math.pow(Math.max(1e-6, wl) / wlRef, -(params.alpha + params.hazeSlope));
}

function layerCoreOpticalDepth(params: {
  rho: number;
  layer: AtmosphereRTLayer;
  lambdaNm?: number;
  lambdaRefNm?: number;
}): number {
  const alpha = finiteOr(params.layer.alpha, 0);
  const hazeSlope = finiteOr(params.layer.hazeSlope, 0);
  const scale = wavelengthScale({
    lambdaNm: params.lambdaNm,
    lambdaRefNm: params.lambdaRefNm,
    alpha,
    hazeSlope,
  });
  return params.layer.tau0 * Math.exp(-(params.rho - params.layer.r0) / params.layer.H) * scale;
}

export function layerOpticalDepthAtRadius(params: {
  rho: number;
  layer: AtmosphereRTLayer;
  lambdaNm?: number;
  lambdaRefNm?: number;
}): number {
  const rho = params.rho;
  const layer = params.layer;
  if (!(Number.isFinite(rho) && rho >= 0)) return 0;
  if (!isValidAtmosphereLayer(layer)) return 0;
  // Points at or inside the solid body surface are fully opaque (not transparent).
  // Return a large optical depth so that exp(-tau) ≈ 0.
  if (!(rho > layer.r0)) return 100;

  const core = layerCoreOpticalDepth(params);
  const cloud = Math.max(0, finiteOr(layer.cloudOpacity, 0));
  return Math.max(0, core + cloud);
}

export function totalAtmosphereTransmission(params: {
  rho: number;
  config: AtmosphereRTParams;
  lambdaNm?: number;
}): number {
  const cfg = params.config;
  const layers = Array.isArray(cfg.layers) ? cfg.layers : [];
  if (layers.length === 0) return 1;
  let tau = 0;
  for (const layer of layers) {
    tau += layerOpticalDepthAtRadius({
      rho: params.rho,
      layer,
      lambdaNm: params.lambdaNm,
      lambdaRefNm: cfg.lambdaRefNm,
    });
  }

  if (cfg.cloudHaze?.enabled) {
    tau += Math.max(0, finiteOr(cfg.cloudHaze.cloudDeckTau, 0));
    const hazeTau = Math.max(0, finiteOr(cfg.cloudHaze.hazeTau, 0));
    const slope = finiteOr(cfg.cloudHaze.hazeSlope, 0);
    const wl = finiteOr(params.lambdaNm, finiteOr(cfg.lambdaRefNm, 550));
    const wlRef = Math.max(1e-6, finiteOr(cfg.lambdaRefNm, 550));
    tau += hazeTau * Math.pow(Math.max(1e-6, wl) / wlRef, -slope);
  }

  tau += gaussianFeatureStrength(params.lambdaNm, cfg.molecularFeatures);

  return Math.exp(-Math.max(0, tau));
}

export function spectralContaminationWeight(params: {
  lambdaNm: number;
  config: AtmosphereRTParams | undefined;
}): number {
  const lambdaNm = params.lambdaNm;
  if (!(Number.isFinite(lambdaNm) && lambdaNm > 0)) return 1;
  const cfg = params.config;
  if (!cfg?.spectralContamination?.enabled) return 1;
  const loss = gaussianFeatureStrength(lambdaNm, cfg.spectralContamination);
  return Math.max(0, Math.exp(-Math.max(0, loss)));
}

export function effectiveCircleAtmosphereOpacity(params: {
  bodyRadius: number;
  config: AtmosphereRTParams;
  lambdaNm?: number;
  radialSamples?: number;
  shellWidthFactor?: number;
}): number {
  const bodyRadius = params.bodyRadius;
  if (!(Number.isFinite(bodyRadius) && bodyRadius > 0)) return 1;

  const layers = validAtmosphereLayers(params.config);
  if (layers.length === 0) return 1;

  const config = { ...params.config, layers };
  const shell = atmosphereShellBounds(bodyRadius, layers, params.shellWidthFactor);
  const integrated = integrateAtmosphereShell({ ...params, config, shell });
  if (!(integrated.weightSum > 0)) return edgeAtmosphereOpacity({ ...params, config, inner: shell.inner });

  const meanTransmission = integrated.weightedTransmission / integrated.weightSum;
  return Math.max(0, Math.min(1, 1 - meanTransmission));
}

function validAtmosphereLayers(config: AtmosphereRTParams): AtmosphereRTLayer[] {
  return (Array.isArray(config.layers) ? config.layers : []).filter(isValidAtmosphereLayer);
}

function atmosphereShellBounds(
  bodyRadius: number,
  layers: AtmosphereRTLayer[],
  shellWidthFactorRaw: number | undefined,
): { inner: number; outer: number } {
  const shellWidthFactor = Math.min(1, Math.max(1e-3, finiteOr(shellWidthFactorRaw, 0.25)));
  const inner = Math.max(bodyRadius, Math.min(...layers.map((layer) => layer.r0)));
  return {
    inner,
    outer: Math.max(inner * SHELL_OUTER_BUFFER_FACTOR, inner + bodyRadius * shellWidthFactor),
  };
}

function radialSampleCount(radialSamples: number | undefined): number {
  return Math.min(128, Math.max(4, Math.floor(finiteOr(radialSamples, 24))));
}

function atmosphereAnnulusSample(
  shell: { inner: number; outer: number },
  index: number,
  count: number,
): {
  rhoMid: number;
  annulusWeight: number;
} {
  const rhoLo = shell.inner + (shell.outer - shell.inner) * (index / count);
  const rhoHi = shell.inner + (shell.outer - shell.inner) * ((index + 1) / count);
  return {
    rhoMid: 0.5 * (rhoLo + rhoHi),
    annulusWeight: Math.max(0, rhoHi * rhoHi - rhoLo * rhoLo),
  };
}

function integrateAtmosphereShell(params: {
  config: AtmosphereRTParams;
  lambdaNm?: number;
  radialSamples?: number;
  shell: { inner: number; outer: number };
}): { weightedTransmission: number; weightSum: number } {
  let weightedTransmission = 0;
  let weightSum = 0;
  const count = radialSampleCount(params.radialSamples);
  for (let i = 0; i < count; i++) {
    const sample = atmosphereAnnulusSample(params.shell, i, count);
    const transmission = totalAtmosphereTransmission({
      rho: sample.rhoMid,
      config: params.config,
      lambdaNm: params.lambdaNm,
    });
    weightedTransmission += transmission * sample.annulusWeight;
    weightSum += sample.annulusWeight;
  }
  return { weightedTransmission, weightSum };
}

function edgeAtmosphereOpacity(params: {
  config: AtmosphereRTParams;
  lambdaNm?: number;
  inner: number;
}): number {
  const edgeTransmission = totalAtmosphereTransmission({
    rho: params.inner * SHELL_OUTER_BUFFER_FACTOR,
    config: params.config,
    lambdaNm: params.lambdaNm,
  });
  return Math.max(0, Math.min(1, 1 - edgeTransmission));
}
