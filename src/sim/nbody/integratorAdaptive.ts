/**
 * Selects fixed or adaptive Verlet steps while preserving integration limits and diagnostics.
 */
import { cloneState } from "./cache";
import { estimateAdaptiveVerletStep } from "./integratorAdaptiveEstimate";
import { integrateStepWithConfig } from "./integratorVerlet";
import type { NBodyState, ResolvedNBodyConfig } from "./types";

type AdaptiveSettings = {
  tol: number;
  dtMin: number;
  growth: number;
  shrink: number;
  dtMaxAbs: number;
};

function ensureDtMaxAbs(dtMaxAbs: number): void {
  if (!Number.isFinite(dtMaxAbs) || dtMaxAbs <= 0) {
    throw new Error("nbody dtMax must be > 0.");
  }
}

function resolveMaxSteps(maxSteps: number | undefined, cfg: ResolvedNBodyConfig): number {
  if (maxSteps !== undefined && Number.isFinite(maxSteps)) {
    return Math.max(1, Math.floor(maxSteps));
  }
  return cfg.integrator.maxSubsteps;
}

function isAtIntegrationTarget(remaining: number): boolean {
  return Math.abs(remaining) < 1e-12;
}

function directedStep(remaining: number, stepMagnitude: number): number {
  return Math.sign(remaining) * Math.min(stepMagnitude, Math.abs(remaining));
}

function integrateFixedVerletToTime(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  dtMaxAbs: number;
  maxSteps: number;
}): NBodyState {
  const { tTarget, cfg, dtMaxAbs, maxSteps } = params;
  let s = params.state;

  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = tTarget - s.t;
    if (isAtIntegrationTarget(remaining)) return s;

    s = integrateStepWithConfig({
      state: s,
      dt: directedStep(remaining, dtMaxAbs),
      cfg,
    });
  }

  throw new Error("nbody integrateToTime exceeded maxSteps (check dtMax).");
}

function adaptiveSettings(cfg: ResolvedNBodyConfig, dtMaxAbs: number): AdaptiveSettings {
  return {
    tol: cfg.integrator.errorTolAbs,
    dtMin: cfg.integrator.dtMin,
    growth: cfg.integrator.growthFactor,
    shrink: cfg.integrator.shrinkFactor,
    dtMaxAbs,
  };
}

function adaptiveStepMagnitude(remaining: number, dtAdaptive: number, settings: AdaptiveSettings): number {
  return Math.min(Math.abs(remaining), Math.max(settings.dtMin, Math.abs(dtAdaptive)));
}

function canShrinkAdaptiveStep(dtTryMag: number, settings: AdaptiveSettings): boolean {
  return dtTryMag > settings.dtMin * 1.0000001;
}

function shouldShrinkAdaptiveStep(err: number, settings: AdaptiveSettings, canShrink: boolean): boolean {
  return Number.isFinite(err) && err > settings.tol && canShrink;
}

function assertAcceptedAdaptiveStep(err: number, settings: AdaptiveSettings, canShrink: boolean): void {
  if (canShrink) return;
  if (Number.isFinite(err) && err <= settings.tol) return;

  const formattedError = Number.isFinite(err) ? err.toExponential(3) : String(err);
  throw new Error(
    `nbody adaptive integrator: cannot meet error tolerance at dtMin (${settings.dtMin}); ` +
      `error ${formattedError} > tol ${settings.tol.toExponential(3)}. ` +
      `Reduce dtMin or relax tolerance.`,
  );
}

function nextAcceptedAdaptiveStep(err: number, dtTryMag: number, settings: AdaptiveSettings): number {
  if (Number.isFinite(err) && err < 0.25 * settings.tol) {
    return Math.min(settings.dtMaxAbs, dtTryMag * settings.growth);
  }
  return dtTryMag;
}

function integrateAdaptiveToTime(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  settings: AdaptiveSettings;
  maxSteps: number;
}): NBodyState {
  const { tTarget, cfg, settings, maxSteps } = params;
  let s = params.state;
  let dtAdaptive = settings.dtMaxAbs;

  for (let steps = 0; steps < maxSteps; steps++) {
    const remaining = tTarget - s.t;
    if (isAtIntegrationTarget(remaining)) return s;

    const dtTryMag = adaptiveStepMagnitude(remaining, dtAdaptive, settings);
    const estimate = estimateAdaptiveVerletStep(s, Math.sign(remaining) * dtTryMag, cfg);
    const canShrink = canShrinkAdaptiveStep(dtTryMag, settings);

    if (shouldShrinkAdaptiveStep(estimate.err, settings, canShrink)) {
      dtAdaptive = Math.max(settings.dtMin, dtTryMag * settings.shrink);
      continue;
    }

    assertAcceptedAdaptiveStep(estimate.err, settings, canShrink);
    s = estimate.state;
    dtAdaptive = nextAcceptedAdaptiveStep(estimate.err, dtTryMag, settings);
  }

  throw new Error("nbody adaptive integrateToTime exceeded maxSteps (check integrator settings).");
}

export function integrateToTimeWithConfig(params: {
  state: NBodyState;
  tTarget: number;
  cfg: ResolvedNBodyConfig;
  maxSteps?: number;
}): NBodyState {
  const { state, tTarget, cfg } = params;
  const dtMaxAbs = cfg.dtMaxAbs;
  ensureDtMaxAbs(dtMaxAbs);

  const maxSteps = resolveMaxSteps(params.maxSteps, cfg);
  const initialState = cloneState(state);
  if (cfg.integrator.mode === "fixed-verlet") {
    return integrateFixedVerletToTime({ state: initialState, tTarget, cfg, dtMaxAbs, maxSteps });
  }

  return integrateAdaptiveToTime({
    state: initialState,
    tTarget,
    cfg,
    settings: adaptiveSettings(cfg, dtMaxAbs),
    maxSteps,
  });
}
