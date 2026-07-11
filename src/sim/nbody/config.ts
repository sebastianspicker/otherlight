import type { SystemParams } from "../../core/types";
import { G_SI, isFinitePositive } from "../../core/units";
import { normalizeRelativityParams } from "../../physics/relativity";
import { resolveOrbitElements } from "../orbits";
import { ANCHOR_TIME_SEC, type NBodyPerturberResolved, type ResolvedNBodyConfig } from "./types";

export type NBodyPlanetMoonParamsLike = {
  enabled?: boolean;
  muStar?: number;
  muPlanet?: number;
  muMoon?: number;
  mStar?: number;
  mPlanet?: number;
  mMoon?: number;
  dtMax?: number;
  softening?: number;
  throwOnOverlap?: boolean;
};

type ResolveEnabledNBodyOptions = {
  onInvalid?: "throw" | "disable";
  defaultDtMaxAbs?: number;
  masses?: { star?: number; planet?: number; moon?: number };
  G?: number;
};

type ResolvedEnabledNBodyPlanetMoonConfig = {
  muStar: number;
  muPlanet: number;
  muMoon: number;
  dtMaxAbs: number;
  softening: number;
  throwOnOverlap: boolean;
};

type DynamicsConfig = NonNullable<SystemParams["dynamics"]>;
type IntegratorConfig = DynamicsConfig["integrator"];
type NBodyPlanetMoonConfig = NonNullable<DynamicsConfig["nbodyPlanetMoon"]>;
type NBodyPerturberConfig = NonNullable<NonNullable<NBodyPlanetMoonConfig["perturbers"]>[number]>;

function isFinitePositiveNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function resolveMuFromInputs(params: { mu?: unknown; m?: unknown; G: number }): number | null {
  const { mu, m, G } = params;
  if (isFinitePositiveNumber(mu)) return mu;
  if (isFinitePositiveNumber(m)) return G * m;
  return null;
}

export function resolveEnabledNBodyPlanetMoonConfig(
  cfg: NBodyPlanetMoonParamsLike | undefined,
  opts?: ResolveEnabledNBodyOptions,
): ResolvedEnabledNBodyPlanetMoonConfig | null {
  if (!cfg?.enabled) return null;

  const onInvalid = opts?.onInvalid ?? "throw";
  const G = resolveGravityConstant(opts);
  const mus = resolveRequiredNBodyMus(cfg, opts, G, onInvalid);
  const dtMaxAbs = resolveDtMaxAbs(cfg, opts, onInvalid);
  if (!mus || dtMaxAbs === null) return null;

  return {
    ...mus,
    dtMaxAbs,
    softening: resolveSoftening(cfg),
    throwOnOverlap: Boolean(cfg.throwOnOverlap),
  };
}

function failInvalid(onInvalid: "throw" | "disable", msg: string): null {
  if (onInvalid === "throw") throw new Error(msg);
  return null;
}

function resolveGravityConstant(opts: ResolveEnabledNBodyOptions | undefined): number {
  return isFinitePositiveNumber(opts?.G) ? opts.G : G_SI;
}

function resolveRequiredNBodyMus(
  cfg: NBodyPlanetMoonParamsLike,
  opts: ResolveEnabledNBodyOptions | undefined,
  G: number,
  onInvalid: "throw" | "disable",
): Pick<ResolvedEnabledNBodyPlanetMoonConfig, "muStar" | "muPlanet" | "muMoon"> | null {
  const muStar = resolveRequiredStarMu(cfg, opts, G, onInvalid);
  if (muStar === null) return null;

  const muPlanet = resolveRequiredPlanetMu(cfg, opts, G, onInvalid);
  if (muPlanet === null) return null;

  const muMoon = resolveRequiredMoonMu(cfg, opts, G, onInvalid);
  if (muMoon === null) return null;

  return { muStar, muPlanet, muMoon };
}

const resolveRequiredStarMu = (
  cfg: NBodyPlanetMoonParamsLike,
  opts: ResolveEnabledNBodyOptions | undefined,
  G: number,
  onInvalid: "throw" | "disable",
): number | null => {
  return resolveRequiredMu("muStar", "mStar", cfg.muStar, cfg.mStar ?? opts?.masses?.star, G, onInvalid);
};

const resolveRequiredPlanetMu = (
  cfg: NBodyPlanetMoonParamsLike,
  opts: ResolveEnabledNBodyOptions | undefined,
  G: number,
  onInvalid: "throw" | "disable",
): number | null => {
  return resolveRequiredMu(
    "muPlanet",
    "mPlanet",
    cfg.muPlanet,
    cfg.mPlanet ?? opts?.masses?.planet,
    G,
    onInvalid,
  );
};

const resolveRequiredMoonMu = (
  cfg: NBodyPlanetMoonParamsLike,
  opts: ResolveEnabledNBodyOptions | undefined,
  G: number,
  onInvalid: "throw" | "disable",
): number | null => {
  return resolveRequiredMu("muMoon", "mMoon", cfg.muMoon, cfg.mMoon ?? opts?.masses?.moon, G, onInvalid);
};

const resolveRequiredMu = (
  muName: string,
  massName: string,
  mu: unknown,
  mass: unknown,
  G: number,
  onInvalid: "throw" | "disable",
): number | null => {
  const resolved = resolveMuFromInputs({ mu, m: mass, G });
  if (resolved) return resolved;
  return failInvalid(onInvalid, `nbody enabled: ${muName} (or ${massName}) must be provided and > 0.`);
};

const resolveDtMaxAbs = (
  cfg: NBodyPlanetMoonParamsLike,
  opts: ResolveEnabledNBodyOptions | undefined,
  onInvalid: "throw" | "disable",
): number | null => {
  const dtRaw = cfg.dtMax;
  const dtMaxAbs =
    typeof dtRaw === "number" && Number.isFinite(dtRaw) && dtRaw > 0
      ? Math.abs(dtRaw)
      : Math.abs(opts?.defaultDtMaxAbs ?? 10);

  if (dtMaxAbs > 0 && Number.isFinite(dtMaxAbs)) return dtMaxAbs;
  return failInvalid(
    onInvalid,
    "nbody enabled: dtMax must be > 0 (or a positive defaultDtMaxAbs must be provided).",
  );
};

const resolveSoftening = (cfg: NBodyPlanetMoonParamsLike): number => {
  return typeof cfg.softening === "number" && Number.isFinite(cfg.softening) ? Math.max(0, cfg.softening) : 0;
};

export function resolveNBodyConfig(
  params: SystemParams,
): { cfg: ResolvedNBodyConfig; keyInputs: KeyInputs } | null {
  const nbody = params.dynamics?.nbodyPlanetMoon;
  const resolvedCfg = resolveEnabledNBodyPlanetMoonConfig(nbody, {
    onInvalid: "throw",
    masses: {
      star: params.star?.m,
      planet: params.planet?.m,
      moon: params.moon?.m,
    },
  });
  if (!resolvedCfg) return null;

  const keyInputs = resolveNBodyKeyInputs(params);
  const perturbers = resolvePerturbers(nbody);
  const cfg = buildResolvedNBodyConfig(params, nbody, resolvedCfg, perturbers);

  return {
    cfg,
    keyInputs: {
      ...keyInputs,
      perturbers,
    },
  };
}

function resolveNBodyKeyInputs(params: SystemParams): Omit<KeyInputs, "perturbers"> {
  if (!params.moon) {
    throw new Error("nbody enabled requires a moon configuration.");
  }

  if (typeof params.planet.orbit === "function") {
    throw new Error("nbody requires a static planet.orbit (initial conditions, not a function provider).");
  }
  if (typeof params.moon.orbitAroundPlanet === "function") {
    throw new Error(
      "nbody requires a static moon.orbitAroundPlanet (initial conditions, not a function provider).",
    );
  }

  return {
    planetEl: resolveOrbitElements(params.planet.orbit, ANCHOR_TIME_SEC, "planet.orbit"),
    moonEl: resolveOrbitElements(params.moon.orbitAroundPlanet, ANCHOR_TIME_SEC, "moon.orbitAroundPlanet"),
  };
}

function resolvePerturbers(nbody: NBodyPlanetMoonConfig | undefined): NBodyPerturberResolved[] {
  const perturbers: NBodyPerturberResolved[] = [];
  const extra = Array.isArray(nbody?.perturbers) ? nbody.perturbers : [];

  for (let i = 0; i < extra.length; i++) {
    const resolved = resolvePerturber(extra[i], i);
    if (resolved) perturbers.push(resolved);
  }

  return perturbers;
}

function resolvePerturber(
  perturber: NBodyPerturberConfig | undefined,
  index: number,
): NBodyPerturberResolved | null {
  if (!perturber || perturber.enabled === false) return null;

  const mu = resolvePerturberMu(perturber);
  if (!isFinitePositive(mu) || !perturber.orbit) return null;

  if (typeof perturber.orbit === "function") {
    throw new Error("nbody perturbers require static orbit elements (initial conditions).");
  }

  return {
    mu,
    orbit: resolveOrbitElements(
      perturber.orbit,
      ANCHOR_TIME_SEC,
      `dynamics.nbodyPlanetMoon.perturbers[${index}].orbit`,
    ),
  };
}

function resolvePerturberMu(perturber: NBodyPerturberConfig): number | undefined {
  return isFinitePositive(perturber.mu)
    ? perturber.mu
    : isFinitePositive(perturber.m)
      ? G_SI * perturber.m
      : undefined;
}

function buildResolvedNBodyConfig(
  params: SystemParams,
  nbody: NBodyPlanetMoonConfig | undefined,
  resolvedCfg: ResolvedEnabledNBodyPlanetMoonConfig,
  perturbers: NBodyPerturberResolved[],
): ResolvedNBodyConfig {
  return {
    muStar: resolvedCfg.muStar,
    muPlanet: resolvedCfg.muPlanet,
    muMoon: resolvedCfg.muMoon,
    dtMaxAbs: resolvedCfg.dtMaxAbs,
    softening: resolvedCfg.softening,
    throwOnOverlap: resolvedCfg.throwOnOverlap,
    perturbers,
    relativity: resolveRelativityConfig(params),
    integrator: resolveIntegratorConfig(params, nbody),
    collision: resolveCollisionConfig(params),
  };
}

function resolveRelativityConfig(params: SystemParams): ResolvedNBodyConfig["relativity"] {
  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  return {
    grOn: Boolean(rel.enabled && rel.grPrecession),
    c: rel.c,
  };
}

function resolveIntegratorConfig(
  params: SystemParams,
  nbody: NBodyPlanetMoonConfig | undefined,
): ResolvedNBodyConfig["integrator"] {
  const globalIntegrator = params.dynamics?.integrator;
  const localIntegrator = nbody?.integrator;

  return {
    mode: resolveIntegratorMode(params, nbody),
    errorTolAbs: resolveErrorTolerance(params, localIntegrator, globalIntegrator),
    dtMin: resolveDtMin(localIntegrator, globalIntegrator),
    growthFactor: resolveGrowthFactor(localIntegrator, globalIntegrator),
    shrinkFactor: resolveShrinkFactor(localIntegrator, globalIntegrator),
    maxSubsteps: resolveMaxSubsteps(localIntegrator, globalIntegrator),
  };
}

function resolveIntegratorMode(
  params: SystemParams,
  nbody: NBodyPlanetMoonConfig | undefined,
): ResolvedNBodyConfig["integrator"]["mode"] {
  const selected =
    nbody?.integrator?.mode ?? params.dynamics?.integrator?.mode ?? defaultIntegratorMode(params.dynamics);

  return selected === "adaptive-verlet" ? "adaptive-verlet" : "fixed-verlet";
}

function defaultIntegratorMode(
  dynamics: DynamicsConfig | undefined,
): ResolvedNBodyConfig["integrator"]["mode"] {
  return dynamics?.fidelityProfile === "accurate" || dynamics?.fidelityProfile === "reference"
    ? "adaptive-verlet"
    : "fixed-verlet";
}

function resolveErrorTolerance(
  params: SystemParams,
  localIntegrator: IntegratorConfig | undefined,
  globalIntegrator: IntegratorConfig | undefined,
): number {
  return Math.max(
    1e-9,
    Number(
      localIntegrator?.errorTolAbs ?? globalIntegrator?.errorTolAbs ?? defaultErrorTolerance(params.dynamics),
    ),
  );
}

function defaultErrorTolerance(dynamics: DynamicsConfig | undefined): number {
  return dynamics?.fidelityProfile === "reference"
    ? 1e-3
    : dynamics?.fidelityProfile === "accurate"
      ? 1e-2
      : 1e-1;
}

function resolveDtMin(
  localIntegrator: IntegratorConfig | undefined,
  globalIntegrator: IntegratorConfig | undefined,
): number {
  return Math.max(1e-6, Number(localIntegrator?.dtMin ?? globalIntegrator?.dtMin ?? 1e-3));
}

function resolveGrowthFactor(
  localIntegrator: IntegratorConfig | undefined,
  globalIntegrator: IntegratorConfig | undefined,
): number {
  return Math.min(
    4,
    Math.max(1.05, Number(localIntegrator?.growthFactor ?? globalIntegrator?.growthFactor ?? 1.5)),
  );
}

function resolveShrinkFactor(
  localIntegrator: IntegratorConfig | undefined,
  globalIntegrator: IntegratorConfig | undefined,
): number {
  return Math.min(
    0.9,
    Math.max(0.1, Number(localIntegrator?.shrinkFactor ?? globalIntegrator?.shrinkFactor ?? 0.5)),
  );
}

function resolveMaxSubsteps(
  localIntegrator: IntegratorConfig | undefined,
  globalIntegrator: IntegratorConfig | undefined,
): number {
  return Math.max(
    1,
    Math.floor(Number(localIntegrator?.maxSubsteps ?? globalIntegrator?.maxSubsteps ?? 2_000_000)),
  );
}

function resolveCollisionConfig(params: SystemParams): ResolvedNBodyConfig["collision"] {
  const collisionCfg = params.dynamics?.collisionPolicy;
  return {
    enabled: Boolean(collisionCfg?.enabled),
    minSeparation: Math.max(0, Number(collisionCfg?.minSeparation ?? 0)),
    onCloseEncounter: collisionCfg?.onCloseEncounter === "abort" ? "abort" : "warn",
  } as const;
}

export type KeyInputs = {
  planetEl: ReturnType<typeof resolveOrbitElements>;
  moonEl: ReturnType<typeof resolveOrbitElements>;
  perturbers: NBodyPerturberResolved[];
};
