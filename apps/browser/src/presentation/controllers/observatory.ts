/** Binds the observatory to live Education state, comparisons, and existing lesson navigation. */
import { resolveLimbDarkeningForBand } from "../../domain/photometry/limbDarkening";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { UiRefs } from "../ui/refs";
import type { BootstrapAppState } from "./bootstrapAppState";
import { invalidateFixedPreview } from "./fixedPreviewCache";
import { updateDidacticComparison } from "./didactics";
import { prepareRadiusComparison, readComparisonRadiusKm } from "./observatoryComparison";
import { wireObservatoryNavigation } from "./observatoryNavigation";
import { findObservatoryTransit } from "./observatoryTransit";
import { isBinaryModeActive } from "./scenarioFlow";

type ObservatoryDeps = {
  state: BootstrapAppState;
  refs: UiRefs;
  seekToTime: (timeSec: number, options?: { resetNoise?: boolean }) => void;
  setRunning: (running: boolean) => void;
  invalidate: () => void;
  refitScene: () => void;
  refreshDidacticSignals: () => void;
  signal: AbortSignal;
};

const text = (id: string, value: string): void => {
  const node = document.getElementById(id);
  if (node && node.textContent !== value) node.textContent = value;
};

const format = (value: number): string => value.toLocaleString("en-US", { maximumFractionDigits: 3 });

export function wireObservatory(deps: ObservatoryDeps) {
  const navigation = wireObservatoryNavigation(deps);
  const form = document.getElementById("radiusComparisonForm") as HTMLFormElement;
  const inputA = document.getElementById("observatoryRadiusA") as HTMLInputElement;
  const inputB = document.getElementById("observatoryRadiusB") as HTMLInputElement;
  const compareButton = document.getElementById("observatoryCompareBtn") as HTMLButtonElement;
  const clearButton = document.getElementById("observatoryClearComparisonBtn") as HTMLButtonElement;
  const jumpButton = document.getElementById("observatoryJumpBtn") as HTMLButtonElement | null;
  let source: BrowserScenarioDraft | undefined;
  let busy = false;

  function sync(): void {
    navigation.sync();
    const { params } = deps.state;
    const binary = isBinaryModeActive(deps.refs);
    form.hidden = binary;
    document.body.dataset.observatorySystem = binary ? "binary" : "transit";
    const radiusSection = document.querySelector<HTMLElement>(".radius-comparison");
    if (radiusSection) radiusSection.hidden = binary;
    const relationship = document.querySelector<HTMLElement>(".radius-relationship");
    if (relationship) relationship.hidden = binary;
    text("radiusComparisonTitle", binary ? "Detached binary system" : "Planet radius");
    text("observatoryTitle", binary ? "Read the light of two stars" : "How size becomes a signal");
    text(
      "observatorySubtitle",
      binary ? "Form a hypothesis. Explore the eclipses." : "Change the radius. Compare the light.",
    );
    if (source !== params) {
      source = params;
      inputA.value = format(params.planet.r / 1000);
      inputB.min = String(Number(deps.refs.planetR.min) / 1000);
      inputB.max = String(Number(deps.refs.planetR.max) / 1000);
      inputB.value = String(Math.min((params.planet.r * 1.5) / 1000, Number(inputB.max)));
      inputB.removeAttribute("aria-invalid");
      text("radiusComparisonStatus", "");
      text(
        "observatoryComparisonSummary",
        "Compare to compute two Education light curves. B is not saved in the workspace.",
      );
      renderEstimates(params, Number(inputB.value));
      text("observatoryStarRadius", `${format(params.star.r / 1000)} km`);
      const model = params.star.photometry?.limbDarkeningModel;
      const law = model ? resolveLimbDarkeningForBand(model, model.bandpass) : undefined;
      const darkened = law && Object.entries(law).some(([key, value]) => key !== "kind" && value !== 0);
      text("observatoryStellarDisk", darkened ? "Limb darkened" : "Uniform limb law");
    }
    compareButton.disabled = busy || binary;
    clearButton.hidden = !deps.state.comparisonCurveSeries?.some((series) => series.id === "radius-a");
    clearButton.disabled = busy;
    if (jumpButton) jumpButton.disabled = binary;
  }

  async function compare(): Promise<void> {
    if (busy || isBinaryModeActive(deps.refs)) return;
    let radiusKm: number;
    try {
      radiusKm = readComparisonRadiusKm(inputB.value, Number(inputB.min), Number(inputB.max));
    } catch (error) {
      inputB.setAttribute("aria-invalid", "true");
      text("radiusComparisonStatus", (error as Error).message);
      inputB.focus();
      return;
    }
    inputB.removeAttribute("aria-invalid");
    busy = true;
    sync();
    form.setAttribute("aria-busy", "true");
    text("radiusComparisonStatus", "Computing the two Education scenarios…");
    const accepted = deps.state.params;
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      if (deps.signal.aborted || accepted !== deps.state.params) return;
      const transitTime = findObservatoryTransit(accepted, deps.state.t);
      const time = transitTime ?? deps.state.t;
      const result = prepareRadiusComparison(accepted, radiusKm, time);
      publishComparison(deps, result, time);
      renderEstimates(accepted, radiusKm);
      text(
        "radiusComparisonStatus",
        `Comparison ready at ${format(time)} s. ${transitTime === undefined ? "No transit estimate found; compared at the current time." : "At the estimated transit center."} Only the planet radius differs.`,
      );
      text(
        "observatoryComparisonSummary",
        `Computed Education comparison: B − A transit flux ${result.comparison.fluxTransitDelta.toExponential(3)} at ${format(time)} s.`,
      );
    } catch (error) {
      text(
        "radiusComparisonStatus",
        `Comparison failed: ${error instanceof Error ? error.message : String(error)}. The accepted model is unchanged.`,
      );
    } finally {
      busy = false;
      form.setAttribute("aria-busy", "false");
      if (!deps.signal.aborted) sync();
    }
  }

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      void compare();
    },
    { signal: deps.signal },
  );
  inputB.addEventListener(
    "input",
    () => {
      inputB.removeAttribute("aria-invalid");
      text("radiusComparisonStatus", "Uncompared radius. Displayed evidence belongs to the last comparison.");
    },
    { signal: deps.signal },
  );
  clearButton.addEventListener(
    "click",
    () => {
      const { state } = deps;
      state.comparisonCurveSeries = undefined;
      state.comparisonGhosts = undefined;
      state.comparisonInset = undefined;
      state.comparisonBadges = undefined;
      state.didacticsRuntime.latestComparison = undefined;
      state.didacticsRuntime.latestComparisonText = undefined;
      state.fixedPlotYRange = undefined;
      invalidateFixedPreview(state);
      if (deps.refs.didCompareOut) deps.refs.didCompareOut.textContent = "";
      deps.seekToTime(state.t, { resetNoise: false });
      text(
        "radiusComparisonStatus",
        "Comparison cleared. Model component traces and event markers restored.",
      );
      text(
        "observatoryComparisonSummary",
        "Compare to compute two Education light curves. B is not saved in the workspace.",
      );
      sync();
      compareButton.focus();
    },
    { signal: deps.signal },
  );
  jumpButton?.addEventListener("click", () => jumpToTransit(deps), { signal: deps.signal });
  sync();
  return { sync, isLearningVisible: navigation.isLearningVisible };
}

function renderEstimates(params: BrowserScenarioDraft, radiusKm: number): void {
  const ratio = (radiusKm * 1000) / params.planet.r;
  const depth = (radius: number) =>
    radius <= params.star.r
      ? `${format(100 * (radius / params.star.r) ** 2)}%`
      : "Outside full-overlap reference";
  text("observatoryDepthA", depth(params.planet.r));
  text("observatoryDepthB", depth(radiusKm * 1000));
  text("observatoryRadiusRatio", `${format(ratio)}× radius → ${format(ratio ** 2)}× planet area.`);
}

function publishComparison(
  deps: ObservatoryDeps,
  result: ReturnType<typeof prepareRadiusComparison>,
  time: number,
): void {
  const { state, refs } = deps;
  const visual = result.comparison.visual;
  state.didacticsRuntime = updateDidacticComparison(state.didacticsRuntime, result.comparison, result.text);
  state.comparisonCurveSeries = visual?.curveSeries;
  state.fixedPlotYRange = undefined;
  invalidateFixedPreview(state);
  state.comparisonGhosts = visual?.sceneGhosts;
  state.comparisonInset = undefined;
  state.comparisonBadges = undefined;
  if (refs.didCompareOut) refs.didCompareOut.textContent = result.text;
  if (refs.plotTrackingMode) {
    refs.plotTrackingMode.value = "fixed";
    refs.plotTrackingMode.dispatchEvent(new Event("change", { bubbles: true }));
  }
  deps.setRunning(false);
  deps.refitScene();
  deps.seekToTime(time, { resetNoise: false });
  deps.invalidate();
}

function jumpToTransit(deps: ObservatoryDeps): void {
  try {
    const time = findObservatoryTransit(deps.state.params, deps.state.t);
    if (time === undefined || !Number.isFinite(time)) {
      text(
        "radiusComparisonStatus",
        "No transit estimate found in a bounded orbit search. Try another time or inspect the geometry.",
      );
      return;
    }
    deps.setRunning(false);
    deps.refitScene();
    deps.seekToTime(time, { resetNoise: false });
    text("radiusComparisonStatus", `At estimated planet mid-transit: ${format(time)} s.`);
  } catch (error) {
    text(
      "radiusComparisonStatus",
      `Transit unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
