import type { NBodyPlanetMoonParams, SystemParams } from "../../core/types";
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
  opts?: {
    onInvalid?: "throw" | "disable";
    defaultDtMaxAbs?: number;
    masses?: { star?: number; planet?: number; moon?: number };
    G?: number;
  },
): {
  muStar: number;
  muPlanet: number;
  muMoon: number;
  dtMaxAbs: number;
  softening: number;
  throwOnOverlap: boolean;
} | null {
  if (!cfg?.enabled) return null;

  const onInvalid = opts?.onInvalid ?? "throw";
  const fail = (msg: string): null => {
    if (onInvalid === "throw") throw new Error(msg);
    return null;
  };

  const G = isFinitePositiveNumber(opts?.G) ? (opts!.G as number) : G_SI;

  const muStar = resolveMuFromInputs({
    mu: cfg.muStar,
    m: cfg.mStar ?? opts?.masses?.star,
    G,
  });
  if (!(muStar && muStar > 0 && Number.isFinite(muStar))) {
    return fail("nbody enabled: muStar (or mStar) must be provided and > 0.");
  }

  const muPlanet = resolveMuFromInputs({
    mu: cfg.muPlanet,
    m: cfg.mPlanet ?? opts?.masses?.planet,
    G,
  });
  if (!(muPlanet && muPlanet > 0 && Number.isFinite(muPlanet))) {
    return fail("nbody enabled: muPlanet (or mPlanet) must be provided and > 0.");
  }

  const muMoon = resolveMuFromInputs({
    mu: cfg.muMoon,
    m: cfg.mMoon ?? opts?.masses?.moon,
    G,
  });
  if (!(muMoon && muMoon > 0 && Number.isFinite(muMoon))) {
    return fail("nbody enabled: muMoon (or mMoon) must be provided and > 0.");
  }

  const dtRaw = cfg.dtMax;
  const dtMaxAbs =
    typeof dtRaw === "number" && Number.isFinite(dtRaw) && dtRaw > 0
      ? Math.abs(dtRaw)
      : Math.abs(opts?.defaultDtMaxAbs ?? 10);

  if (!(dtMaxAbs > 0 && Number.isFinite(dtMaxAbs))) {
    return fail("nbody enabled: dtMax must be > 0 (or a positive defaultDtMaxAbs must be provided).");
  }

  const softening =
    typeof cfg.softening === "number" && Number.isFinite(cfg.softening) ? Math.max(0, cfg.softening) : 0;

  return {
    muStar,
    muPlanet,
    muMoon,
    dtMaxAbs,
    softening,
    throwOnOverlap: Boolean(cfg.throwOnOverlap),
  };
}

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

  const planetEl = resolveOrbitElements(params.planet.orbit, ANCHOR_TIME_SEC, "planet.orbit");
  const moonEl = resolveOrbitElements(
    params.moon.orbitAroundPlanet,
    ANCHOR_TIME_SEC,
    "moon.orbitAroundPlanet",
  );

  const perturbers: NBodyPerturberResolved[] = [];
  const extra = Array.isArray(nbody?.perturbers) ? nbody!.perturbers! : [];

  for (let i = 0; i < extra.length; i++) {
    const p = extra[i] as any;
    if (!p || p.enabled === false) continue;
    const mu = isFinitePositive(p.mu) ? p.mu : isFinitePositive(p.m) ? G_SI * p.m : undefined;
    if (!isFinitePositive(mu)) continue;
    if (!p.orbit) continue;
    if (typeof p.orbit === "function") {
      throw new Error("nbody perturbers require static orbit elements (initial conditions).");
    }
    const el = resolveOrbitElements(
      p.orbit,
      ANCHOR_TIME_SEC,
      `dynamics.nbodyPlanetMoon.perturbers[${i}].orbit`,
    );
    perturbers.push({ mu, orbit: el });
  }

  const rel = normalizeRelativityParams(params.dynamics?.relativity);
  const relativity = {
    grOn: Boolean(rel.enabled && rel.grPrecession),
    c: rel.c,
  };

  const globalIntegrator = params.dynamics?.integrator;
  const localIntegrator = nbody?.integrator;
  const mode =
    (localIntegrator?.mode ??
      globalIntegrator?.mode ??
      (params.dynamics?.fidelityProfile === "accurate" || params.dynamics?.fidelityProfile === "reference"
        ? "adaptive-verlet"
        : "fixed-verlet")) === "adaptive-verlet"
      ? "adaptive-verlet"
      : "fixed-verlet";

  const dtMin = Math.max(1e-6, Number(localIntegrator?.dtMin ?? globalIntegrator?.dtMin ?? 1e-3));
  const errorTolAbs = Math.max(
    1e-9,
    Number(
      localIntegrator?.errorTolAbs ??
        globalIntegrator?.errorTolAbs ??
        (params.dynamics?.fidelityProfile === "reference"
          ? 1e-3
          : params.dynamics?.fidelityProfile === "accurate"
            ? 1e-2
            : 1e-1),
    ),
  );
  const growthFactor = Math.min(
    4,
    Math.max(1.05, Number(localIntegrator?.growthFactor ?? globalIntegrator?.growthFactor ?? 1.5)),
  );
  const shrinkFactor = Math.min(
    0.9,
    Math.max(0.1, Number(localIntegrator?.shrinkFactor ?? globalIntegrator?.shrinkFactor ?? 0.5)),
  );
  const maxSubsteps = Math.max(
    10_000,
    Math.floor(Number(localIntegrator?.maxSubsteps ?? globalIntegrator?.maxSubsteps ?? 2_000_000)),
  );

  const collisionCfg = params.dynamics?.collisionPolicy;
  const collision = {
    enabled: Boolean(collisionCfg?.enabled),
    minSeparation: Math.max(0, Number(collisionCfg?.minSeparation ?? 0)),
    onCloseEncounter: collisionCfg?.onCloseEncounter === "abort" ? "abort" : "warn",
  } as const;

  const cfg: ResolvedNBodyConfig = {
    muStar: resolvedCfg.muStar,
    muPlanet: resolvedCfg.muPlanet,
    muMoon: resolvedCfg.muMoon,
    dtMaxAbs: resolvedCfg.dtMaxAbs,
    softening: resolvedCfg.softening,
    throwOnOverlap: resolvedCfg.throwOnOverlap,
    perturbers,
    relativity,
    integrator: {
      mode,
      errorTolAbs,
      dtMin,
      growthFactor,
      shrinkFactor,
      maxSubsteps,
    },
    collision,
  };

  return {
    cfg,
    keyInputs: {
      planetEl,
      moonEl,
      perturbers,
    },
  };
}

export type KeyInputs = {
  planetEl: ReturnType<typeof resolveOrbitElements>;
  moonEl: ReturnType<typeof resolveOrbitElements>;
  perturbers: NBodyPerturberResolved[];
};

export function nbodyCfgForLegacy(
  cfg: NBodyPlanetMoonParams | undefined,
  params: Pick<SystemParams, "star" | "planet" | "moon">,
) {
  return resolveEnabledNBodyPlanetMoonConfig(cfg, {
    onInvalid: "throw",
    masses: {
      star: params.star?.m,
      planet: params.planet?.m,
      moon: params.moon?.m,
    },
  });
}
