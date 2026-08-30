/** Shared numeric policy for fixed-window frame sampling. */
export const FIXED_PLOT_SAMPLE_COUNT = 256;
export const FIXED_PLOT_MIN_HALF_WINDOW_SEC = 6 * 3600;

export function finitePositive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
