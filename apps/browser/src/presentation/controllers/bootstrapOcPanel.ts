/**
 * Owns bootstrap Oc Panel support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { UiRefs } from "../ui/refs";
import { runWithErrorHandling } from "./runWithErrorHandling";
import {
  exportOcCsv,
  formatOcFitSummary,
  formatOcPanelStats,
  renderOcHistoryCanvas,
  type OcBody,
  type OcTrendMode,
  type OcUnit,
} from "./ocPlot";
import {
  formatTransitHistorySummary,
  resetTransitHistoryState,
  type TransitHistoryState,
} from "../../application/transitHistory";

type BootstrapOcPanelState = {
  transitHistory: TransitHistoryState;
};

type BootstrapOcPanelDeps = {
  refs: UiRefs;
  state: BootstrapOcPanelState;
  warnEl: HTMLElement | null | undefined;
  getSuccessMessage: () => string;
  signal?: AbortSignal;
};

export function createBootstrapOcPanelController(deps: BootstrapOcPanelDeps): {
  renderOcPanel: () => void;
  wireOcControls: () => void;
} {
  const { refs, state, warnEl, getSuccessMessage, signal } = deps;
  const {
    ocBodySelect,
    ocCanvas,
    ocClearBtn,
    ocExportBtn,
    ocFitVal,
    ocStatsVal,
    ocTrendModeSelect,
    ocUnitSelect,
    timingHistoryVal,
  } = refs;
  const listenerOptions = signal ? { signal } : undefined;

  let ocBody: OcBody = "planet";
  let ocUnit: OcUnit = "s";
  let ocTrendMode: OcTrendMode = "raw";
  let clearedHistory: TransitHistoryState | null = null;
  const undoClearBtn = document.getElementById("ocUndoClearBtn") as HTMLButtonElement | null;

  const cloneHistory = (history: TransitHistoryState): TransitHistoryState => ({
    maxEvents: history.maxEvents,
    planet: { ...history.planet, events: history.planet.events.map((event) => ({ ...event })) },
    moon: { ...history.moon, events: history.moon.events.map((event) => ({ ...event })) },
  });

  const renderOcPanel = (): void => {
    renderOcHistoryCanvas(ocCanvas, state.transitHistory, ocBody, {
      unit: ocUnit,
      trendMode: ocTrendMode,
    });
    if (ocStatsVal) {
      ocStatsVal.textContent = formatOcPanelStats(state.transitHistory, ocBody, {
        unit: ocUnit,
        trendMode: ocTrendMode,
      });
    }
    if (ocFitVal) {
      ocFitVal.textContent = formatOcFitSummary(state.transitHistory, ocBody, {
        unit: ocUnit,
      });
    }
  };

  const wireOcControls = (): void => {
    if (ocBodySelect) {
      ocBody = ocBodySelect.value === "moon" ? "moon" : "planet";
      ocBodySelect.addEventListener(
        "change",
        () => {
          ocBody = ocBodySelect.value === "moon" ? "moon" : "planet";
          renderOcPanel();
        },
        listenerOptions,
      );
    }
    if (ocUnitSelect) {
      ocUnit = ocUnitSelect.value === "ms" ? "ms" : "s";
      ocUnitSelect.addEventListener(
        "change",
        () => {
          ocUnit = ocUnitSelect.value === "ms" ? "ms" : "s";
          renderOcPanel();
        },
        listenerOptions,
      );
    }
    if (ocTrendModeSelect) {
      ocTrendMode =
        ocTrendModeSelect.value === "fit"
          ? "fit"
          : ocTrendModeSelect.value === "detrended"
            ? "detrended"
            : "raw";
      ocTrendModeSelect.addEventListener(
        "change",
        () => {
          ocTrendMode =
            ocTrendModeSelect.value === "fit"
              ? "fit"
              : ocTrendModeSelect.value === "detrended"
                ? "detrended"
                : "raw";
          renderOcPanel();
        },
        listenerOptions,
      );
    }

    ocExportBtn?.addEventListener(
      "click",
      () => {
        runWithErrorHandling(
          () => exportOcCsv(state.transitHistory, ocBody, { unit: ocUnit, trendMode: ocTrendMode }),
          {
            statusEl: warnEl ?? null,
            getSuccessMessage,
            errorPrefix: "Export failed: ",
          },
        );
      },
      listenerOptions,
    );

    ocClearBtn?.addEventListener(
      "click",
      () => {
        clearedHistory = cloneHistory(state.transitHistory);
        state.transitHistory = resetTransitHistoryState(state.transitHistory);
        if (timingHistoryVal) {
          timingHistoryVal.textContent = formatTransitHistorySummary(state.transitHistory);
        }
        if (undoClearBtn) {
          undoClearBtn.hidden =
            clearedHistory.planet.events.length === 0 && clearedHistory.moon.events.length === 0;
        }
        renderOcPanel();
      },
      listenerOptions,
    );

    undoClearBtn?.addEventListener(
      "click",
      () => {
        if (!clearedHistory) return;
        state.transitHistory = clearedHistory;
        clearedHistory = null;
        undoClearBtn.hidden = true;
        if (timingHistoryVal)
          timingHistoryVal.textContent = formatTransitHistorySummary(state.transitHistory);
        renderOcPanel();
      },
      listenerOptions,
    );
  };

  return { renderOcPanel, wireOcControls };
}
