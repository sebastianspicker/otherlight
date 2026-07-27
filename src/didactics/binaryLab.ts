/**
 * Owns binary Lab support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
export type BinaryLabHypothesis =
  | "primary-eclipse-deepest"
  | "secondary-eclipse-dominates"
  | "eccentricity-shifts-eclipse-spacing";

export type BinaryLabState = {
  skyVisible: boolean;
  revealed: boolean;
  hypothesis?: BinaryLabHypothesis;
  hideSkyUntilReveal: boolean;
  requireHypothesis: boolean;
  lockParamsUntilHypothesis: boolean;
};

export type BinaryLabStateOptions = {
  hideSkyUntilReveal?: boolean;
  requireHypothesis?: boolean;
  lockParamsUntilHypothesis?: boolean;
};

export function createBinaryLabState(opts: BinaryLabStateOptions = {}): BinaryLabState {
  const hideSkyUntilReveal = Boolean(opts.hideSkyUntilReveal ?? true);
  const requireHypothesis = Boolean(opts.requireHypothesis ?? true);
  const lockParamsUntilHypothesis = Boolean(opts.lockParamsUntilHypothesis ?? true);

  return {
    skyVisible: !hideSkyUntilReveal,
    revealed: !hideSkyUntilReveal,
    hypothesis: undefined,
    hideSkyUntilReveal,
    requireHypothesis,
    lockParamsUntilHypothesis,
  };
}

export function setHypothesis(state: BinaryLabState, hypothesis: BinaryLabHypothesis): BinaryLabState {
  return {
    ...state,
    hypothesis,
  };
}

export function canRevealSky(state: BinaryLabState): boolean {
  if (!state.hideSkyUntilReveal) return true;
  if (!state.requireHypothesis) return true;
  return Boolean(state.hypothesis);
}

export function canEditParams(state: BinaryLabState): boolean {
  if (!state.lockParamsUntilHypothesis) return true;
  return Boolean(state.hypothesis);
}

export function revealSky(state: BinaryLabState): BinaryLabState {
  if (!canRevealSky(state)) return state;

  return {
    ...state,
    skyVisible: true,
    revealed: true,
  };
}
