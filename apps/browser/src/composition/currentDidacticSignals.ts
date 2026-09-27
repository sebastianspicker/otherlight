/** Rebuilds lesson signals from accepted authoring state and a live simulation frame. */
import { computeDidacticSignals } from "../domain/education";
import type { BrowserScenarioDraft, DidacticSignals, StepResult } from "../domain/model/types";
import type { SimulationFrame } from "../domain/simulation/frames";

function didacticStepFromFrame(frame: SimulationFrame): StepResult {
  return {
    fluxTotal: frame.flux.total,
    fluxTransitFactor: frame.flux.transitFactor,
    planetSky: frame.kinematics.planetSky,
    moonSky: frame.kinematics.moonSky,
    meta: {
      t: frame.tObsSec,
      bPlanet: frame.debug?.bPlanet,
      bMoon: frame.debug?.bMoon,
      tdvRatio: frame.debug?.tdvRatio,
      observables: frame.observables,
      baselineFluxUsed: frame.debug?.baselineFluxUsed,
      displayFluxValue: frame.debug?.displayFluxValue,
    },
  };
}

/** Uses current lesson progress without depending on the runtime's cloned didactics config. */
export function currentDidacticSignals(
  params: BrowserScenarioDraft,
  frame: SimulationFrame,
): DidacticSignals | undefined {
  return computeDidacticSignals(params, didacticStepFromFrame(frame));
}
