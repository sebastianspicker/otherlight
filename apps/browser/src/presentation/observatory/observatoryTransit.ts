/** Finds a nearby Education transit estimate without stepping the active runtime. */
import { cloneParams } from "../../domain/model/clone";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { toPreviewScenarioV4 } from "../../application/browserScenarioAdapter";
import { createSimulationV4 } from "../../domain/simulation/v4";

function isTransitCandidate(
  center: number,
  nearest: number | undefined,
  fromSec: number,
  period: number,
): boolean {
  return center >= fromSec - 1 && center <= fromSec + period && (nearest === undefined || center < nearest);
}

function refinedTransitCenter(
  probe: ReturnType<typeof createSimulationV4>,
  sampleTimeSec: number,
): number | undefined {
  let center = probe.step(sampleTimeSec).timing?.planetTransitCenterSec;
  if (center === undefined || !Number.isFinite(center)) return undefined;
  for (let refinement = 0; refinement < 3; refinement++) {
    center = probe.step(center).timing?.planetTransitCenterSec ?? center;
  }
  return center;
}

/** Bounded search; an absent estimate does not prove that the orbit has no transit. */
export function findObservatoryTransit(params: BrowserScenarioDraft, fromSec: number): number | undefined {
  const config = toPreviewScenarioV4(cloneParams(params));
  const period = config.bodies.planets[0]?.orbit.period;
  if (!period || !Number.isFinite(period) || !Number.isFinite(fromSec)) return undefined;
  const probe = createSimulationV4(config);
  let nearest: number | undefined;
  for (let index = 0; index <= 32; index++) {
    const center = refinedTransitCenter(probe, fromSec + (period * index) / 32);
    if (center === undefined) continue;
    if (isTransitCandidate(center, nearest, fromSec, period)) nearest = center;
  }
  return nearest;
}
