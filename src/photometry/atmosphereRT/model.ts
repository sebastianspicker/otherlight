import type { AtmosphereRTLayer, AtmosphereRTParams } from "../../core/types";

function finiteOr(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
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
  if (!(Number.isFinite(layer.r0) && layer.r0 > 0)) return 0;
  if (!(Number.isFinite(layer.H) && layer.H > 0)) return 0;
  if (!(Number.isFinite(layer.tau0) && layer.tau0 >= 0)) return 0;
  // Points at or inside the solid body surface are fully opaque (not transparent).
  // Return a large optical depth so that exp(-tau) ≈ 0.
  if (!(rho > layer.r0)) return 100;

  const alpha = finiteOr(layer.alpha, 0);
  const hazeSlope = finiteOr(layer.hazeSlope, 0);
  const wl = finiteOr(params.lambdaNm, finiteOr(params.lambdaRefNm, 550));
  const wlRef = Math.max(1e-6, finiteOr(params.lambdaRefNm, 550));
  const wlScale = Math.pow(Math.max(1e-6, wl) / wlRef, -(alpha + hazeSlope));
  const core = layer.tau0 * Math.exp(-(rho - layer.r0) / layer.H) * wlScale;
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

  return Math.exp(-Math.max(0, tau));
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

  const layers = (Array.isArray(params.config.layers) ? params.config.layers : []).filter(
    (layer) =>
      layer &&
      Number.isFinite(layer.r0) &&
      layer.r0 > 0 &&
      Number.isFinite(layer.H) &&
      layer.H > 0 &&
      Number.isFinite(layer.tau0) &&
      layer.tau0 >= 0,
  );
  if (layers.length === 0) return 1;

  const radialSamplesRaw = Math.floor(finiteOr(params.radialSamples, 24));
  const radialSamples = Math.min(128, Math.max(4, radialSamplesRaw));
  const shellWidthFactor = Math.min(1, Math.max(1e-3, finiteOr(params.shellWidthFactor, 0.25)));
  const inner = Math.max(bodyRadius, Math.min(...layers.map((layer) => layer.r0)));
  const outer = Math.max(inner * 1.000001, inner + bodyRadius * shellWidthFactor);

  let weightedTransmission = 0;
  let weightSum = 0;
  for (let i = 0; i < radialSamples; i++) {
    const t0 = i / radialSamples;
    const t1 = (i + 1) / radialSamples;
    const rhoLo = inner + (outer - inner) * t0;
    const rhoHi = inner + (outer - inner) * t1;
    const rhoMid = 0.5 * (rhoLo + rhoHi);
    const annulusWeight = Math.max(0, rhoHi * rhoHi - rhoLo * rhoLo);
    const transmission = totalAtmosphereTransmission({
      rho: rhoMid,
      config: {
        ...params.config,
        layers,
      },
      lambdaNm: params.lambdaNm,
    });
    weightedTransmission += transmission * annulusWeight;
    weightSum += annulusWeight;
  }

  if (!(weightSum > 0)) {
    const edgeTransmission = totalAtmosphereTransmission({
      rho: inner * 1.000001,
      config: {
        ...params.config,
        layers,
      },
      lambdaNm: params.lambdaNm,
    });
    return Math.max(0, Math.min(1, 1 - edgeTransmission));
  }

  const meanTransmission = weightedTransmission / weightSum;
  return Math.max(0, Math.min(1, 1 - meanTransmission));
}
