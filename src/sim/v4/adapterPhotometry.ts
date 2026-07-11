import type { BinaryStarPhotometryParams, PhotometryParams, SystemParams } from "../../core/types";
import type { StarBodyV4 } from "./types";

function ensurePhotometry(params: SystemParams): PhotometryParams {
  params.star.photometry = params.star.photometry ?? {};
  return params.star.photometry;
}

export function toBinaryStarPhotometry(star: StarBodyV4): BinaryStarPhotometryParams | undefined {
  const out: BinaryStarPhotometryParams = {};
  if (Number.isFinite(star.luminosityScale)) {
    out.luminosityScale = Math.max(0, star.luminosityScale as number);
  }
  if (Number.isFinite(star.teffK)) out.teffK = star.teffK;
  if (Number.isFinite(star.loggCgs)) out.loggCgs = star.loggCgs;
  if (Number.isFinite(star.metallicityDex)) out.metallicityDex = star.metallicityDex;
  if (typeof star.passband === "string" && star.passband.length > 0) out.passband = star.passband;
  return Object.keys(out).length > 0 ? out : undefined;
}

function detachedSecondaryLuminosity(star: StarBodyV4): number {
  return Number.isFinite(star.luminosityScale) ? Math.max(0, star.luminosityScale as number) : 0.25;
}

export function applyDetachedBinaryPhotometryBridge(base: SystemParams, starB: StarBodyV4): void {
  const phot = ensurePhotometry(base);

  // Detached-binary bridge in legacy kernel:
  // secondary luminous star is represented as additive constant on the mapped orbiting body.
  phot.phaseCurve = {
    enabled: true,
    reflAmp: 0,
    thermAmp: 0,
    reflOffset: 0,
    thermOffset: 0,
    lambertian: false,
    constant: detachedSecondaryLuminosity(starB),
    physicalScaling: false,
  };
  if (base.dynamics?.fidelityProfile === "accurate" || base.dynamics?.fidelityProfile === "reference") {
    phot.additiveComposition = "higher-fidelity-coupled";
  }
}
