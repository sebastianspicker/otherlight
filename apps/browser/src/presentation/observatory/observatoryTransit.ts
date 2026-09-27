/** Finds a nearby Education transit estimate without stepping the active runtime. */
import { cloneParams } from "../../domain/model/clone";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { toPreviewScenarioV4 } from "../../application/browserScenarioAdapter";
import { createSimulationV4 } from "../../domain/simulation/v4";

/** Bounded search; an absent estimate does not prove that the orbit has no transit. */
export function findObservatoryTransit(params: BrowserScenarioDraft, fromSec: number): number | undefined {
  const config = toPreviewScenarioV4(cloneParams(params));
  const period = config.bodies.planets[0]?.orbit.period;
  if (!period || !Number.isFinite(period) || !Number.isFinite(fromSec)) return undefined;
  const probe = createSimulationV4(config);
  let nearest: number | undefined;
  for (let index = 0; index <= 32; index++) {
    let center = probe.step(fromSec + (period * index) / 32).timing?.planetTransitCenterSec;
    if (center === undefined || !Number.isFinite(center)) continue;
    for (let refinement = 0; refinement < 3; refinement++) {
      center = probe.step(center).timing?.planetTransitCenterSec ?? center;
    }
    if (center >= fromSec - 1 && center <= fromSec + period && (nearest === undefined || center < nearest)) {
      nearest = center;
    }
  }
  return nearest;
}
