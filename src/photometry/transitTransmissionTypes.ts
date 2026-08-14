/** Shared occulter and stellar-disk inputs for transmissive transit integration. */
import type { BrightnessPatch, LimbDarkeningLaw } from "../core/types";
import type { PatchCombineMode } from "./patches";

export type TransmissionOcculter = {
  /** Sky-plane offset of occulter center relative to star center (same units as rStar). */
  dx: number;
  dy: number;
  /** Reference opaque radius (solid body). */
  r0?: number;
  /** Transmission function T(rho) (typically in [0,1]), rho >= 0. */
  transmission?: (rho: number) => number;
};

export type FluxStarWithTransmissionParams = {
  rStar: number;
  occulters: TransmissionOcculter[];
  /** Optional limb-darkening law. If omitted, intensity is uniform across the disk. */
  limbDarkening?: LimbDarkeningLaw;
  /** Optional projected brightness patches (spots/faculae), multiplicative in intensity. */
  brightnessPatches?: BrightnessPatch[];
  /** Patch combination policy. Default: "multiply" (backwards compatible). */
  patchCombineMode?: PatchCombineMode;
  /** Grid resolution ~ number of samples across the stellar diameter. */
  gridRes?: number;
  /** If true (default), clamp transmission values and final flux to [0,1]. */
  clamp01?: boolean;
  /** Optional early-exit threshold for the transmission product. */
  earlyExitTMin?: number;
};
