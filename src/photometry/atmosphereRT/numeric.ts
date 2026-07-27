/**
 * Owns numeric support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
export function finiteOr(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}
