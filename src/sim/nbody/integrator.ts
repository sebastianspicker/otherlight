/**
 * Public N-body integrator facade. Keeps established import paths stable while numerical concerns live in focused modules.
 */
export { buildBodyArrays, unpackBodyArrays } from "./integratorBodies";
export { integrateToTimeWithConfig } from "./integratorAdaptive";
