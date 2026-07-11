import type { SystemParams } from "../core/types";
import { G_SI, isFinitePositive } from "../core/units";
import type { NormalizedRelativityParams, solveLightTimeCorrectedResult } from "../physics/relativity";

export type LightTimeShapiroConfig = NonNullable<
  Parameters<typeof solveLightTimeCorrectedResult>[0]["shapiro"]
>;

export function baseShapiroParams(
  params: SystemParams,
  rel: NormalizedRelativityParams,
  muStarRel: number | undefined,
): LightTimeShapiroConfig | undefined {
  if (!(rel.enabled && rel.shapiro && isFinitePositive(muStarRel))) return undefined;

  return {
    enabled: true,
    mu: params.dynamics?.relativityLevel === "enhanced" ? enhancedShapiroMu(params, muStarRel) : muStarRel,
    minImpact: rel.shapiroMinImpact,
  };
}

function enhancedShapiroMu(params: SystemParams, muStarRel: number): number {
  return (
    muStarRel +
    (isFinitePositive(params.planet.m) ? G_SI * params.planet.m : 0) +
    (isFinitePositive(params.moon?.m) ? G_SI * params.moon!.m! : 0)
  );
}
