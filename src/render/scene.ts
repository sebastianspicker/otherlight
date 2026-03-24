import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3/types";

export type RenderSceneArgs = {
  renderer: {
    drawFrameV3: (params: SystemParams, step: SimulationStepV3, tSec: number) => void;
  };
  step: SimulationStepV3;
  params: SystemParams;
  tSec: number;
};

export function renderScene(args: RenderSceneArgs): void {
  args.renderer.drawFrameV3(args.params, args.step, args.tSec);
}
