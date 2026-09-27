/** Prepares a single-variable Education comparison without mutating accepted authoring state. */
import { cloneParams } from "../../application/scenario";
import { compareScenariosAtTime, interpretDidacticComparison } from "../../domain/education";
import { createSimulationV4, mapBrowserScenarioDraftToEducationScenarioV4 } from "../../domain/simulation/v4";
import { displayFluxValueForConfig } from "../../domain/simulation/v4/binaryBaseline";
import type { BrowserScenarioDraft } from "../../domain/model/types";

export function readComparisonRadiusKm(text: string, minKm: number, maxKm: number): number {
  const radius = Number(text);
  if (text.trim() === "" || !Number.isFinite(radius) || radius < minKm || radius > maxKm) {
    throw new Error(
      `Enter a planet radius between ${minKm.toLocaleString("en-US")} and ${maxKm.toLocaleString("en-US")} km.`,
    );
  }
  return radius;
}

export function prepareRadiusComparison(params: BrowserScenarioDraft, radiusKm: number, timeSec: number) {
  const alternate = cloneParams(params);
  alternate.planet.r = radiusKm * 1000;
  const comparison = compareScenariosAtTime(params, alternate, timeSec);
  const visual = comparison.visual;
  const configs = [params, alternate].map(mapBrowserScenarioDraftToEducationScenarioV4);
  const runtimes = configs.map((config) => createSimulationV4(config));
  const halfWindow = Math.max(
    3600,
    ...runtimes.map((runtime) => (runtime.step(timeSec).timing?.planetTransitDurationSec ?? 1800) * 1.3),
  );
  if (visual) {
    visual.curveSeries = visual.curveSeries.map((series, index) => ({
      ...series,
      id: `radius-${index === 0 ? "a" : "b"}`,
      samples: Array.from({ length: 256 }, (_, sample) => {
        const t = timeSec - halfWindow + (2 * halfWindow * sample) / 255;
        return { t, flux: displayFluxValueForConfig(configs[index], runtimes[index].step(t).flux.total) };
      }),
      label: `${index === 0 ? "A" : "B"} · ${((index === 0 ? params.planet.r : alternate.planet.r) / 1000).toLocaleString("en-US")} km`,
      color: index === 0 ? "#9ddcff" : "#f3cf87",
      style: index === 0 ? ("dashed" as const) : ("solid" as const),
    }));
    visual.sceneGhosts = visual.sceneGhosts.map((ghost, index) => ({
      ...ghost,
      label: index === 0 ? "A" : "B",
      color: index === 0 ? "#9ddcff" : "#f3cf87",
    }));
  }
  const estimateA = (params.planet.r / params.star.r) ** 2;
  const estimateB = (alternate.planet.r / params.star.r) ** 2;
  const text = [
    `Radius comparison at ${timeSec.toFixed(1)} s (Education model).`,
    `A radius: ${params.planet.r / 1000} km; B radius: ${radiusKm} km; star radius: ${params.star.r / 1000} km.`,
    `Geometric reference depths: A ${(estimateA * 100).toFixed(3)}%, B ${(estimateB * 100).toFixed(3)}% (uniform star, full overlap).`,
    interpretDidacticComparison(comparison),
  ].join("\n");
  return { comparison, text, estimateA, estimateB };
}
