/**
 * Owns transit Transmission Point support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import { clamp01, isFinitePositive } from "../core/units";
import type { TransmissionOcculter } from "./transitTransmissionTypes";

export function safeTransmissionValue(x: number, doClamp: boolean): number {
  // Non-finite transmission should behave like "no effect" to avoid blowing up the integral.
  if (!Number.isFinite(x)) return 1;
  return doClamp ? clamp01(x) : x;
}

export function hardDiskTransmission(rho: number, r0: number, doClamp: boolean): number {
  if (!Number.isFinite(rho) || rho < 0) return 1;
  if (!Number.isFinite(r0) || r0 <= 0) return 1;
  const T = rho <= r0 ? 0 : 1;
  return doClamp ? clamp01(T) : T;
}

export function hasFiniteOcculterOffset(o: TransmissionOcculter | undefined): o is TransmissionOcculter {
  return Boolean(o && Number.isFinite(o.dx) && Number.isFinite(o.dy));
}

export function rawOcculterTransmission(o: TransmissionOcculter, rho: number, doClamp: boolean): number {
  if (typeof o.transmission === "function") return safeTransmissionValue(o.transmission(rho), doClamp);
  return isFinitePositive(o.r0) ? hardDiskTransmission(rho, o.r0, doClamp) : 1;
}

export function transmissionForOcculter(
  x: number,
  y: number,
  o: TransmissionOcculter | undefined,
  doClamp: boolean,
): number {
  if (!hasFiniteOcculterOffset(o)) return 1;
  const rho = Math.hypot(x - o.dx, y - o.dy);
  const Ti = rawOcculterTransmission(o, rho, doClamp);
  if (!Number.isFinite(Ti)) return 1;
  return doClamp ? clamp01(Ti) : Ti;
}

export function shouldExitTransmissionProduct(Ttot: number, earlyExitTMin: number): boolean {
  return Ttot <= earlyExitTMin || Ttot === 0;
}

/**
 * Total transmission T_total(x,y) = PI_i T_i(rho_i).
 *
 * Consistency:
 * - For hard disks, this product equals the union mask.
 */
export function transmissionAtPoint(params: {
  x: number;
  y: number;
  occulters: TransmissionOcculter[];
  doClamp: boolean;
  earlyExitTMin: number;
}): number {
  const { x, y, occulters, doClamp, earlyExitTMin } = params;

  if (!Array.isArray(occulters) || occulters.length === 0) return 1;

  let Ttot = 1;
  for (const o of occulters) {
    Ttot *= transmissionForOcculter(x, y, o, doClamp);
    if (shouldExitTransmissionProduct(Ttot, earlyExitTMin)) return doClamp ? 0 : Ttot;
  }

  return doClamp ? clamp01(Ttot) : Ttot;
}
