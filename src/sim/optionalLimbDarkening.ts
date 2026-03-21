// src/sim/optionalLimbDarkening.ts
//
// Optional limb-darkening support loaded via dynamic import.
// This keeps the core build functional even if optional photometry modules are absent.

import type { SystemParams } from "../core/types";
import type { CircleOcculter } from "../photometry/occulterCircle";

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

// True once at least one load attempt finished (successfully or not).
let optionalLdTried = false;

// Shared in-flight promise for concurrency safety.
let loadPromise: Promise<void> | null = null;

export function hasLdIntegrators(): boolean {
  return integrators !== null;
}

export function getLdIntegrators(): OptionalLdIntegrators | null {
  return integrators;
}

/**
 * Idempotent loader for optional limb-darkening modules.
 * Safe to call repeatedly; never throws if the optional modules are missing.
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
      const m1 = (await import("../photometry/transitLimbDarkened")) as Record<string, unknown>;
      const fluxFnDirect = (m1?.fluxLimbDarkenedDisk ?? m1?.default ?? null) as FluxLimbDarkenedDiskFn | null;
      const fluxFnDetailed = m1?.fluxLimbDarkenedDiskDetailed as
        | ((args: unknown) => { flux?: number } | number)
        | undefined;
      const fluxFn =
        fluxFnDirect ??
        (typeof fluxFnDetailed === "function"
          ? (args: unknown): number => {
              const out = fluxFnDetailed(args);
              if (typeof out === "number") return out;
              const flux = out?.flux;
              return Number.isFinite(flux) ? (flux as number) : 1;
            }
          : null);

      const m2 = (await import("../photometry/limbDarkening")) as Record<string, unknown>;
      const resolveFn = (m2?.resolveLimbDarkeningForBand ?? null) as ResolveLimbDarkeningForBandFn | null;

      if (fluxFn && resolveFn) {
        integrators = {
          fluxLimbDarkenedDisk: fluxFn,
          resolveLimbDarkeningForBand: resolveFn,
        };
      } else {
        integrators = null;
      }
    } catch {
      // Deliberate swallow: optional LD module absent or failed to load.
      // Simulation continues with uniform-disk fallback (tested in error-recovery tests).
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
