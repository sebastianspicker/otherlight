// src/sim/optionalLimbDarkening.ts
//
// Optional limb-darkening integrator loader.
// The public API remains lazy/idempotent for call-site compatibility, but the
// transit-LD integrator is now statically imported because the V4 runtime also
// depends on it directly. Keeping a second dynamic import path only produced an
// ineffective split warning during build.

import type { SystemParams } from "../core/types";
import type { CircleOcculter } from "../photometry/occulterCircle";
import { resolveLimbDarkeningForBand } from "../photometry/limbDarkening";
import { fluxLimbDarkenedDiskDetailed } from "../photometry/transitLimbDarkened";

// Keep these types intentionally structural/local to avoid importing optional photometry types here.
export type FluxLimbDarkenedDiskFn = (args: {
  rStar: number;
  rOcculters: CircleOcculter[];
  limbDarkeningLaw: unknown;
  constraints?: unknown;
  brightnessPatches?: unknown;
  gridRes?: number;
  patchCombineMode?: unknown;
  earlyExitFluxEps?: number;
}) => number;

export type ResolveLimbDarkeningForBandFn = (model: unknown, bandpass?: unknown) => unknown;

export type OptionalLdIntegrators = {
  fluxLimbDarkenedDisk: FluxLimbDarkenedDiskFn;
  resolveLimbDarkeningForBand: ResolveLimbDarkeningForBandFn;
};

let integrators: OptionalLdIntegrators | null = null;

// True once at least one load attempt finished.
let optionalLdTried = false;

// Shared in-flight promise for concurrency safety.
let loadPromise: Promise<void> | null = null;

export function getLdIntegrators(): OptionalLdIntegrators | null {
  return integrators;
}

/**
 * Idempotent loader for limb-darkening integrators.
 * Safe to call repeatedly; preserves the old async call shape even though the
 * integrator is now part of the main bundle.
 *
 * Concurrency policy:
 * - Multiple concurrent callers await the same in-flight promise.
 * - On completion, `optionalLdTried` is set and `integrators` is either populated or null.
 */
export async function ensureOptionalLimbDarkeningLoaded(): Promise<void> {
  if (integrators) {
    optionalLdTried = true;
    return;
  }

  if (loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async (): Promise<void> => {
    try {
      const fluxFn: FluxLimbDarkenedDiskFn = (args: unknown): number => {
        const out = fluxLimbDarkenedDiskDetailed(args as Parameters<typeof fluxLimbDarkenedDiskDetailed>[0]);
        const flux = out?.flux;
        return Number.isFinite(flux) ? flux : 1;
      };
      const resolveFn = resolveLimbDarkeningForBand as ResolveLimbDarkeningForBandFn | null;

      if (resolveFn) {
        integrators = {
          fluxLimbDarkenedDisk: fluxFn,
          resolveLimbDarkeningForBand: resolveFn,
        };
      } else {
        integrators = null;
      }
    } catch {
      // Deliberate swallow to preserve the historical optional-loader contract.
      // Simulation continues with uniform-disk fallback if the integrator path
      // itself throws unexpectedly.
      integrators = null;
    } finally {
      optionalLdTried = true;
      loadPromise = null;
    }
  })();

  await loadPromise;
}

/** Convenience wrapper used by prepareSimulation(). */
export async function preloadOptionalLimbDarkening(): Promise<void> {
  await ensureOptionalLimbDarkeningLoaded();
}

/**
 * Fire-and-forget background loading if LD is configured but prepareSimulation() wasn't awaited.
 * This is safe: it never throws and does not block stepSystem().
 * Note: The first frame after prepareSimulation() resolves will use LD if loaded; call await prepareSimulation()
 * before starting the animation loop to ensure the first frame has LD when configured.
 */
export function kickoffOptionalLimbDarkeningIfRequested(params: SystemParams): void {
  const ldModel = params.star?.photometry?.limbDarkeningModel;
  if (!ldModel) return;

  // If already loaded or currently loading, do nothing.
  if (integrators || loadPromise) return;

  // If it was tried before and failed, do not keep retrying every step.
  if (optionalLdTried) return;

  void ensureOptionalLimbDarkeningLoaded().catch(() => {
    // Deliberately swallow: optional module absent must not break core sim.
  });
}
