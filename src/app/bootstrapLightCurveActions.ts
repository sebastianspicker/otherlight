/**
 * Owns bootstrap Light Curve Actions support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { LightCurvePlot } from "../render/lightCurvePlot";

type LightCurveActionState = {
  lastPlottedT: number;
  lastPlotMode: string | null;
  fixedPlotYRange?: { lo: number; hi: number };
  fixedPlotYRangeMode?: string | null;
};

type BootstrapLightCurveActionDeps = {
  plot: LightCurvePlot;
  state: LightCurveActionState;
  clearButton: HTMLButtonElement;
  undoButton: HTMLButtonElement | null;
  exportButton: HTMLButtonElement | null;
  plotMode: HTMLSelectElement | null;
  invalidate: () => void;
  setStatus: (message: string) => void;
  signal: AbortSignal;
};

export function wireBootstrapLightCurveActions(deps: BootstrapLightCurveActionDeps): void {
  const { plot, state, clearButton, undoButton, exportButton, plotMode, invalidate, setStatus, signal } =
    deps;
  let clearedLightCurve: ReturnType<LightCurvePlot["createHistorySnapshot"]> | null = null;
  const options = { signal };

  clearButton.addEventListener(
    "click",
    () => {
      clearedLightCurve = plot.createHistorySnapshot();
      plot.clear();
      plot.setOptions({ manualYRange: undefined });
      state.lastPlottedT = Number.NaN;
      state.lastPlotMode = null;
      state.fixedPlotYRange = undefined;
      state.fixedPlotYRangeMode = null;
      if (undoButton) undoButton.hidden = clearedLightCurve.flux.length === 0;
      const summary = document.getElementById("lcSummary");
      if (summary) summary.textContent = "Light-curve history cleared. Use Undo clear to restore it.";
      setStatus("Light-curve history cleared. Undo is available until another clear.");
      invalidate();
    },
    options,
  );

  undoButton?.addEventListener(
    "click",
    () => {
      if (!clearedLightCurve) return;
      plot.restoreHistorySnapshot(clearedLightCurve);
      plot.draw();
      clearedLightCurve = null;
      undoButton.hidden = true;
      const summary = plot.getAccessibleSnapshot();
      const summaryEl = document.getElementById("lcSummary");
      if (summaryEl) {
        summaryEl.textContent = `${summary.sampleCount} restored light-curve samples. The active series is ${plotMode?.value === "measured" ? "measured" : "physical"} flux.`;
      }
      setStatus("Light-curve history restored.");
      invalidate();
    },
    options,
  );

  exportButton?.addEventListener(
    "click",
    () => {
      const snapshot = plot.getAccessibleSnapshot();
      if (snapshot.sampleCount === 0) {
        setStatus("No light-curve samples are available to export.");
        return;
      }
      downloadCsv(plot.buildCsv());
      setStatus(`${snapshot.sampleCount} light-curve samples exported as CSV.`);
    },
    options,
  );
}

function downloadCsv(csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "transit-light-curve.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
