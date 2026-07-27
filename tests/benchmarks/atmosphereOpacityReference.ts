/** Provides independent atmosphere-opacity reference data for calibration comparisons. */

import type { AtmosphereRTParams } from "../../src/core/types";
import { totalAtmosphereTransmission } from "../../src/photometry/atmosphereRT/model";

type AtmosphereLayer = NonNullable<AtmosphereRTParams["layers"]>[number];

type ReferenceArgs = {
  bodyRadius: number;
  config: AtmosphereRTParams;
  lambdaNm?: number;
  radialSamples?: number;
  shellWidthFactor?: number;
};

type ReferenceBounds = {
  inner: number;
  outer: number;
};

type TransmissionAverage = {
  weightedTransmission: number;
  weightSum: number;
};

function validAtmosphereLayers(config: AtmosphereRTParams): AtmosphereLayer[] {
  return (Array.isArray(config.layers) ? config.layers : []).filter(isValidLayer);
}

function isValidLayer(layer: AtmosphereLayer | null | undefined): layer is AtmosphereLayer {
  if (!layer) return false;
  return (
    Number.isFinite(layer.r0) &&
    layer.r0 > 0 &&
    Number.isFinite(layer.H) &&
    layer.H > 0 &&
    Number.isFinite(layer.tau0) &&
    layer.tau0 >= 0
  );
}

function referenceRadialSamples(value: number | undefined): number {
  return Math.max(512, Math.floor(value ?? 4096));
}

function referenceShellWidthFactor(value: number | undefined): number {
  return Math.min(1, Math.max(1e-3, value ?? 0.25));
}

function referenceBounds(
  bodyRadius: number,
  layers: AtmosphereLayer[],
  shellWidthFactor: number,
): ReferenceBounds {
  const inner = Math.max(bodyRadius, Math.min(...layers.map((layer) => layer.r0)));
  return {
    inner,
    outer: Math.max(inner * 1.000001, inner + bodyRadius * shellWidthFactor),
  };
}

function annulusWeight(rhoLo: number, rhoHi: number): number {
  return Math.max(0, rhoHi * rhoHi - rhoLo * rhoLo);
}

function annulusTransmission(args: {
  config: AtmosphereRTParams;
  layers: AtmosphereLayer[];
  lambdaNm?: number;
  rhoMid: number;
}): number {
  return totalAtmosphereTransmission({
    rho: args.rhoMid,
    config: {
      ...args.config,
      layers: args.layers,
    },
    lambdaNm: args.lambdaNm,
  });
}

function annulusTransmissionAverage(args: {
  bounds: ReferenceBounds;
  config: AtmosphereRTParams;
  lambdaNm?: number;
  layers: AtmosphereLayer[];
  radialSamples: number;
}): TransmissionAverage {
  let weightedTransmission = 0;
  let weightSum = 0;
  const span = args.bounds.outer - args.bounds.inner;
  for (let i = 0; i < args.radialSamples; i += 1) {
    const rhoLo = args.bounds.inner + span * (i / args.radialSamples);
    const rhoHi = args.bounds.inner + span * ((i + 1) / args.radialSamples);
    const weight = annulusWeight(rhoLo, rhoHi);
    weightedTransmission +=
      annulusTransmission({
        config: args.config,
        layers: args.layers,
        lambdaNm: args.lambdaNm,
        rhoMid: 0.5 * (rhoLo + rhoHi),
      }) * weight;
    weightSum += weight;
  }
  return { weightedTransmission, weightSum };
}

export function highResolutionEffectiveCircleAtmosphereOpacityReference(args: ReferenceArgs): number {
  const bodyRadius = args.bodyRadius;
  const layers = validAtmosphereLayers(args.config);
  if (!(Number.isFinite(bodyRadius) && bodyRadius > 0) || layers.length === 0) return 1;

  const average = annulusTransmissionAverage({
    bounds: referenceBounds(bodyRadius, layers, referenceShellWidthFactor(args.shellWidthFactor)),
    config: args.config,
    lambdaNm: args.lambdaNm,
    layers,
    radialSamples: referenceRadialSamples(args.radialSamples),
  });

  if (!(average.weightSum > 0)) return 1;
  return 1 - average.weightedTransmission / average.weightSum;
}
