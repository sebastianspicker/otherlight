/**
 * Wires the Education and Scientific profile switch.
 */
import {
  readProductProfile,
  syncProductProfileNavigation,
  syncProductProfileVisibility,
} from "./productProfile";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { wireScienceWorkspace } from "../science/scienceWorkspace";
import { isGitHubPagesRuntime } from "../../application/deployment";

type BootstrapProfileArgs = {
  select: HTMLSelectElement;
  requestContextChange: (action: () => void) => void;
  pauseEducationRuntime: () => void;
  writeHistory: (kind: "push" | "replace") => void;
  setStatus: (message: string) => void;
  getScientificSystem: () => BrowserScenarioDraft;
  isBinaryMode: () => boolean;
  signal: AbortSignal;
};

export type BootstrapProfileController = {
  syncFromControl: (announce?: boolean) => void;
};

export function wireBootstrapProfile(args: BootstrapProfileArgs): BootstrapProfileController {
  const educationButton = document.getElementById("profileEducationBtn") as HTMLButtonElement | null;
  const scientificButton = document.getElementById("profileScientificBtn") as HTMLButtonElement | null;
  const isGitHubPages = isGitHubPagesRuntime();
  const scienceWorkspace = wireScienceWorkspace({
    getSystem: args.getScientificSystem,
    isBinaryMode: args.isBinaryMode,
    signal: args.signal,
    isGitHubPages,
  });
  const syncFromControl = (announce = false): void => {
    const profile = readProductProfile(args.select.value);
    syncProductProfileVisibility(profile);
    syncProductProfileNavigation(args.select, educationButton, scientificButton);
    if (profile === "scientific") args.pauseEducationRuntime();
    if (profile === "scientific") {
      void scienceWorkspace.refreshCapabilities();
      void scienceWorkspace.refreshDatasets();
    } else void scienceWorkspace.cancelCurrentJob();
    if (!announce) return;
    args.setStatus(
      profile === "scientific"
        ? isGitHubPages
          ? "Scientific workspace selected. V5 jobs are unavailable on GitHub Pages; run the local loopback service to use them."
          : "Scientific workspace selected. V4 education execution is paused; check the local V5 backend."
        : "Education workspace selected. Interactive V4 preview is ready.",
    );
  };

  args.select.addEventListener(
    "change",
    () => {
      syncFromControl(true);
      args.writeHistory("push");
    },
    { signal: args.signal },
  );

  const selectProfile = (profile: "education" | "scientific"): void => {
    if (args.select.value === profile) return;
    args.requestContextChange(() => {
      args.select.value = profile;
      args.select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  educationButton?.addEventListener("click", () => selectProfile("education"), {
    signal: args.signal,
  });
  scientificButton?.addEventListener("click", () => selectProfile("scientific"), {
    signal: args.signal,
  });

  syncFromControl();
  return { syncFromControl };
}
