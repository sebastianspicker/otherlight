// src/sim/limbDarkeningBridge.ts
//
// Re-exports limb-darkening functions for use by the render layer.
// This bridge allows render/ to depend on sim/ (permitted) rather than
// importing directly from photometry/ (which would violate layer boundaries).

export { intensityNonNegative, resolveAndValidateLimbDarkening } from "../photometry/limbDarkening";
