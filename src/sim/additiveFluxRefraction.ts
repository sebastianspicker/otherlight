/** Refraction-effect helpers kept separate from the additive-flux public surface. */
import type { AdditiveFluxContext, BandWeight, SkyPosition } from "./additiveFluxTypes";

export type RefractionContext = {
  rt: NonNullable<AdditiveFluxContext["rt"]>;
  refraction: NonNullable<NonNullable<AdditiveFluxContext["rt"]>["refraction"]>;
  bands: BandWeight[];
  starRadius: number;
  amp: number;
  lambdaRef: number;
  chromaticSlope: number;
};

export function buildRefractionContext(context: AdditiveFluxContext): RefractionContext | undefined {
  const rt = context.rt;
  const refraction = rt?.refraction;
  if (!rt?.enabled || !refraction?.enabled) return undefined;
  return {
    rt,
    refraction,
    bands: context.bands,
    starRadius: context.starRadius,
    amp: Number.isFinite(refraction.amp) ? Math.max(0, refraction.amp as number) : 0,
    lambdaRef: Number.isFinite(rt.lambdaRefNm) ? Math.max(1, rt.lambdaRefNm as number) : 550,
    chromaticSlope: Number.isFinite(refraction.chromaticSlope) ? (refraction.chromaticSlope as number) : 0,
  };
}

export function refractionFluxForBody(
  context: RefractionContext,
  body: { r: number },
  sky: SkyPosition | undefined,
  target: "planet" | "moon",
): number {
  if (!sky || !(sky.z > 0) || (context.rt.target ?? "planet") !== target || context.amp <= 0) return 0;
  const contactRadius = context.starRadius + body.r;
  const impactDistance = Math.hypot(sky.x, sky.y);
  const configuredWidth = context.refraction.width;
  const sigma =
    Number.isFinite(configuredWidth) && (configuredWidth as number) > 0
      ? (configuredWidth as number)
      : Math.max(body.r * 0.8, context.starRadius * 0.04);
  const distance = impactDistance - contactRadius;
  const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
  let bandWeighted = 0;
  for (const band of context.bands) {
    const wavelengthScale = Math.pow(Math.max(1, band.lambdaNm) / context.lambdaRef, -context.chromaticSlope);
    bandWeighted += band.w * wavelengthScale;
  }
  return context.amp * weight * bandWeighted;
}
