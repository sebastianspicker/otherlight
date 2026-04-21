import type { PassbandId } from "../core/types";

const PLANCK_H = 6.626_070_15e-34;
const LIGHT_C = 299_792_458;
const BOLTZMANN_K = 1.380_649e-23;

type PassbandSample = { lambdaM: number; throughput: number };

const TRIANGULAR_THROUGHPUT = [0, 0.55, 1, 0.55, 0] as const;

function buildPassbandSamples(wavelengthsNm: readonly number[]): PassbandSample[] {
  return wavelengthsNm.map((wavelengthNm, index) => ({
    lambdaM: wavelengthNm * 1e-9,
    throughput: TRIANGULAR_THROUGHPUT[index] ?? 0,
  }));
}

const PASSBAND_THROUGHPUT_SAMPLES: Record<string, PassbandSample[]> = {
  u: buildPassbandSamples([320, 340, 365, 390, 410]),
  b: buildPassbandSamples([390, 420, 445, 470, 500]),
  g: buildPassbandSamples([400, 440, 477, 515, 550]),
  v: buildPassbandSamples([500, 525, 551, 577, 600]),
  r: buildPassbandSamples([560, 590, 623, 655, 690]),
  i: buildPassbandSamples([690, 725, 763, 800, 840]),
  z: buildPassbandSamples([820, 860, 905, 950, 1000]),
};

export type StellarBandFluxInput = {
  r: number;
  teffK?: number;
  passband?: PassbandId;
  luminosityScale?: number;
};

export type DetachedBinaryLuminosities = {
  primary: number;
  secondary: number;
  source: "physical-bandpass" | "compatibility-scale";
};

function finitePositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizePassbandId(passband: unknown): string | undefined {
  if (typeof passband !== "string") return undefined;
  const normalized = passband.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export function isSupportedStellarPassband(passband: unknown): boolean {
  const normalized = normalizePassbandId(passband);
  return Boolean(normalized && PASSBAND_THROUGHPUT_SAMPLES[normalized]);
}

function passbandSamples(passband?: PassbandId): PassbandSample[] | undefined {
  const normalized = normalizePassbandId(passband);
  if (!normalized) return PASSBAND_THROUGHPUT_SAMPLES.v;
  if (PASSBAND_THROUGHPUT_SAMPLES[normalized]) {
    return PASSBAND_THROUGHPUT_SAMPLES[normalized];
  }
  return undefined;
}

function planckSpectralRadiance(lambdaM: number, teffK: number): number {
  const exponent = (PLANCK_H * LIGHT_C) / (lambdaM * BOLTZMANN_K * teffK);
  const denom = Math.expm1(Math.min(exponent, 700));
  if (!(denom > 0)) return 0;
  return (2 * PLANCK_H * LIGHT_C * LIGHT_C) / (Math.pow(lambdaM, 5) * denom);
}

export function relativeStellarBandFlux(input: StellarBandFluxInput): number | undefined {
  const radius = finitePositive(input.r);
  const teffK = finitePositive(input.teffK);
  if (!radius || !teffK) return undefined;
  const samples = passbandSamples(input.passband);
  if (!samples) return undefined;
  let weightedIntegral = 0;
  let throughputIntegral = 0;

  for (let i = 1; i < samples.length; i += 1) {
    const left = samples[i - 1];
    const right = samples[i];
    const deltaLambda = right.lambdaM - left.lambdaM;
    if (!(deltaLambda > 0)) continue;

    const leftValue = left.throughput * planckSpectralRadiance(left.lambdaM, teffK);
    const rightValue = right.throughput * planckSpectralRadiance(right.lambdaM, teffK);
    weightedIntegral += 0.5 * (leftValue + rightValue) * deltaLambda;
    throughputIntegral += 0.5 * (left.throughput + right.throughput) * deltaLambda;
  }

  if (!(weightedIntegral > 0) || !(throughputIntegral > 0)) return undefined;
  const spectralRadiance = weightedIntegral / throughputIntegral;
  return spectralRadiance > 0 ? radius * radius * spectralRadiance : undefined;
}

export function resolveDetachedBinaryLuminosities(args: {
  primary: StellarBandFluxInput;
  secondary: StellarBandFluxInput;
  fallbackPassband?: PassbandId;
  secondaryFallbackLuminosityScale: number;
}): DetachedBinaryLuminosities {
  const { primary, secondary, fallbackPassband, secondaryFallbackLuminosityScale } = args;
  const primaryPhysical = relativeStellarBandFlux({
    ...primary,
    passband: primary.passband ?? fallbackPassband,
  });
  const secondaryPhysical = relativeStellarBandFlux({
    ...secondary,
    passband: secondary.passband ?? fallbackPassband,
  });

  if (primaryPhysical && secondaryPhysical) {
    return {
      primary: 1,
      secondary: secondaryPhysical / primaryPhysical,
      source: "physical-bandpass",
    };
  }

  return {
    primary: finiteNonNegative(primary.luminosityScale) ?? 1,
    secondary: finiteNonNegative(secondary.luminosityScale) ?? Math.max(0, secondaryFallbackLuminosityScale),
    source: "compatibility-scale",
  };
}
