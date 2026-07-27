/**
 * Owns bootstrap View Controls support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { Canvas2DRenderer, LightCurvePlot } from "../render/canvas2d";
import type { UiRefs } from "../ui/refs";
import { readTimeSpeed } from "./actions";

type BootstrapViewControlDeps = {
  refs: UiRefs;
  renderer: Canvas2DRenderer;
  plot: LightCurvePlot;
  signal?: AbortSignal;
};

type ListenerOptions = AddEventListenerOptions | undefined;

export function wireBootstrapViewControls(deps: BootstrapViewControlDeps): void {
  const { refs, renderer, plot, signal } = deps;
  const listenerOptions = signal ? { signal } : undefined;

  wireTimeSpeedControls(refs, listenerOptions);
  wirePlotTrackingMode(refs, plot, listenerOptions);
  wireManualZoomControls(refs, renderer, listenerOptions);
  wireZoomButtons(refs, renderer, listenerOptions);
  wireAutoFitControl(refs, renderer, listenerOptions);
}

function setZoomControlsEnabled(refs: UiRefs, enabled: boolean): void {
  if (refs.btnZoomOut) refs.btnZoomOut.disabled = !enabled;
  if (refs.btnZoomIn) refs.btnZoomIn.disabled = !enabled;
  if (refs.btnZoomReset) refs.btnZoomReset.disabled = !enabled;
}

function syncZoomReadout(refs: UiRefs, renderer: Canvas2DRenderer): void {
  if (refs.zoomVal) refs.zoomVal.textContent = `${renderer.getZoomMultiplier().toFixed(1)}x`;
}

function applyZoomMultiplier(refs: UiRefs, renderer: Canvas2DRenderer, next: number): void {
  renderer.setZoomMultiplier(next);
  renderer.invalidateSceneScale();
  syncZoomReadout(refs, renderer);
}

function wireTimeSpeedControls(refs: UiRefs, listenerOptions: ListenerOptions): void {
  const syncTimeSpeed = () => void readTimeSpeed(refs.timeSpeed, refs.timeSpeedVal, refs.timeSpeedMultiplier);
  refs.timeSpeed.addEventListener("input", syncTimeSpeed, listenerOptions);
  refs.timeSpeedMultiplier.value = "1";
  refs.timeSpeedMultiplier.addEventListener("change", syncTimeSpeed, listenerOptions);
  syncTimeSpeed();
}

function plotTrackingModeValue(value: string): "fixed" | "dynamic" | "live" {
  if (value === "live") return "live";
  if (value === "dynamic") return "dynamic";
  return "fixed";
}

function wirePlotTrackingMode(refs: UiRefs, plot: LightCurvePlot, listenerOptions: ListenerOptions): void {
  const control = refs.plotTrackingMode;
  if (control) {
    control.value = "dynamic";
    control.addEventListener(
      "change",
      () => {
        plot.setOptions({ trackingMode: plotTrackingModeValue(control.value) });
      },
      listenerOptions,
    );
  }
}

function wireManualZoomControls(
  refs: UiRefs,
  renderer: Canvas2DRenderer,
  listenerOptions: ListenerOptions,
): void {
  const control = refs.viewZoomEnabled;
  if (control) {
    control.checked = false;
    setZoomControlsEnabled(refs, false);
    renderer.resetZoom();
    syncZoomReadout(refs, renderer);
    control.addEventListener(
      "change",
      () => {
        const enabled = control.checked;
        setZoomControlsEnabled(refs, enabled);
        if (!enabled) {
          renderer.resetZoom();
          renderer.invalidateSceneScale();
          syncZoomReadout(refs, renderer);
        }
      },
      listenerOptions,
    );
  } else {
    syncZoomReadout(refs, renderer);
  }
}

function wireZoomButtons(refs: UiRefs, renderer: Canvas2DRenderer, listenerOptions: ListenerOptions): void {
  refs.btnZoomOut?.addEventListener(
    "click",
    () => {
      if (!refs.viewZoomEnabled?.checked) return;
      applyZoomMultiplier(refs, renderer, renderer.getZoomMultiplier() / 1.5);
    },
    listenerOptions,
  );
  refs.btnZoomIn?.addEventListener(
    "click",
    () => {
      if (!refs.viewZoomEnabled?.checked) return;
      applyZoomMultiplier(refs, renderer, renderer.getZoomMultiplier() * 1.5);
    },
    listenerOptions,
  );
  refs.btnZoomReset?.addEventListener(
    "click",
    () => {
      if (!refs.viewZoomEnabled?.checked) return;
      applyZoomMultiplier(refs, renderer, 1);
    },
    listenerOptions,
  );
}

function wireAutoFitControl(
  refs: UiRefs,
  renderer: Canvas2DRenderer,
  listenerOptions: ListenerOptions,
): void {
  const control = refs.viewAutoFit;
  if (control) {
    control.checked = false;
    renderer.setAutoFitScene(false);
    control.addEventListener(
      "change",
      () => {
        renderer.setAutoFitScene(control.checked);
        renderer.invalidateSceneScale();
      },
      listenerOptions,
    );
  }
}
