import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import type { UiRefs } from "../ui/refs";
import { readTimeSpeed } from "./actions";

type BootstrapViewControlDeps = {
  refs: UiRefs;
  renderer: Canvas2DRenderer;
  plot: LightCurvePlot;
};

export function wireBootstrapViewControls(deps: BootstrapViewControlDeps): void {
  const { refs, renderer, plot } = deps;
  const {
    btnZoomIn,
    btnZoomOut,
    btnZoomReset,
    plotTrackingMode,
    timeSpeed,
    timeSpeedMultiplier,
    timeSpeedVal,
    viewAutoFit,
    viewZoomEnabled,
    zoomVal,
  } = refs;

  const setZoomControlsEnabled = (enabled: boolean): void => {
    if (btnZoomOut) btnZoomOut.disabled = !enabled;
    if (btnZoomIn) btnZoomIn.disabled = !enabled;
    if (btnZoomReset) btnZoomReset.disabled = !enabled;
  };

  const syncZoomReadout = (): void => {
    if (zoomVal) zoomVal.textContent = `${renderer.getZoomMultiplier().toFixed(1)}x`;
  };

  const applyZoomMultiplier = (next: number): void => {
    renderer.setZoomMultiplier(next);
    renderer.invalidateSceneScale();
    syncZoomReadout();
  };

  const syncTimeSpeed = () => void readTimeSpeed(timeSpeed, timeSpeedVal, timeSpeedMultiplier);
  timeSpeed.addEventListener("input", syncTimeSpeed);
  timeSpeedMultiplier.value = "1";
  timeSpeedMultiplier.addEventListener("change", syncTimeSpeed);
  syncTimeSpeed();

  if (plotTrackingMode) {
    plotTrackingMode.value = "dynamic";
    plotTrackingMode.addEventListener("change", () => {
      const nextMode =
        plotTrackingMode.value === "live"
          ? "live"
          : plotTrackingMode.value === "dynamic"
            ? "dynamic"
            : "fixed";
      plot.setOptions({ trackingMode: nextMode });
    });
  }

  if (viewZoomEnabled) {
    viewZoomEnabled.checked = false;
    setZoomControlsEnabled(false);
    renderer.resetZoom();
    syncZoomReadout();
    viewZoomEnabled.addEventListener("change", () => {
      const enabled = viewZoomEnabled.checked;
      setZoomControlsEnabled(enabled);
      if (!enabled) {
        renderer.resetZoom();
        renderer.invalidateSceneScale();
        syncZoomReadout();
      }
    });
  } else {
    syncZoomReadout();
  }

  btnZoomOut?.addEventListener("click", () => {
    if (!viewZoomEnabled?.checked) return;
    applyZoomMultiplier(renderer.getZoomMultiplier() / 1.5);
  });
  btnZoomIn?.addEventListener("click", () => {
    if (!viewZoomEnabled?.checked) return;
    applyZoomMultiplier(renderer.getZoomMultiplier() * 1.5);
  });
  btnZoomReset?.addEventListener("click", () => {
    if (!viewZoomEnabled?.checked) return;
    applyZoomMultiplier(1);
  });

  if (viewAutoFit) {
    viewAutoFit.checked = false;
    renderer.setAutoFitScene(false);
    viewAutoFit.addEventListener("change", () => {
      renderer.setAutoFitScene(viewAutoFit.checked);
      renderer.invalidateSceneScale();
    });
  }
}
