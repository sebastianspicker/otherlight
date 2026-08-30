/**
 * Owns limb Darkening Bands support within the photometry layer. Keeps measurement modeling independently composable with simulation output.
 */
import type { PassbandId } from "../model/types";

const BLUE_LIMB_DARKENING_BANDS = new Set<PassbandId>(["u", "b"]);
const RED_LIMB_DARKENING_BANDS = new Set<PassbandId>(["r", "i", "z", "y"]);

export function limbDarkeningBandShift(band: PassbandId): number {
  if (BLUE_LIMB_DARKENING_BANDS.has(band)) return 0.06;
  if (RED_LIMB_DARKENING_BANDS.has(band)) return -0.05;
  return 0;
}
