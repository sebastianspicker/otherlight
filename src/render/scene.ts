import type { SystemParams } from "../core/types";
import type { RenderConfigV3, SimulationStepV3 } from "../sim/v3/types";

export type RenderSceneArgs = {
  renderer: {
    drawFrameV3: (params: SystemParams, step: SimulationStepV3, tSec: number) => void;
    debug?: unknown;
  };
  step: SimulationStepV3;
  params: SystemParams;
  tSec: number;
  renderConfig?: RenderConfigV3;
};

export function renderScene(args: RenderSceneArgs): void {
  // Progressive hook: map high-level render mode to existing debug toggles.
  if (args.renderer.debug && typeof args.renderer.debug === "object") {
    const debug = args.renderer.debug as Record<string, unknown>;
    if (args.renderConfig?.didacticMode === "scientific") {
      debug.showFluxDecomposition = true;
      debug.showImpactParams = true;
      debug.showTDV = true;
    } else if (args.renderConfig?.didacticMode === "didactic") {
      debug.showFluxDecomposition = false;
      debug.showImpactParams = true;
      debug.showTDV = false;
    }
  }

  args.renderer.drawFrameV3(args.params, args.step, args.tSec);
}
