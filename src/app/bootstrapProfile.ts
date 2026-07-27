/**
 * Owns bootstrap Profile support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import {
  readProductProfile,
  syncProductProfileNavigation,
  syncProductProfileVisibility,
} from "../ui/productProfile";
import type { SystemParams } from "../core/types";
import { wireScienceWorkspace } from "./scienceWorkspace";

type BootstrapProfileArgs = {
  select: HTMLSelectElement;
  requestContextChange: (action: () => void) => void;
  pauseEducationRuntime: () => void;
  writeHistory: (kind: "push" | "replace") => void;
  setStatus: (message: string) => void;
  getScientificSystem: () => SystemParams;
  isBinaryMode: () => boolean;
  signal: AbortSignal;
};

export type BootstrapProfileController = {
  syncFromControl: (announce?: boolean) => void;
};

export function wireBootstrapProfile(args: BootstrapProfileArgs): BootstrapProfileController {
  const educationButton = document.getElementById("profileEducationBtn") as HTMLButtonElement | null;
  const scientificButton = document.getElementById("profileScientificBtn") as HTMLButtonElement | null;
  const scienceWorkspace = wireScienceWorkspace({
    getSystem: args.getScientificSystem,
    isBinaryMode: args.isBinaryMode,
    signal: args.signal,
  });
  const syncFromControl = (announce = false): void => {
    const profile = readProductProfile(args.select.value);
    syncProductProfileVisibility(profile);
    syncProductProfileNavigation(args.select, educationButton, scientificButton);
    if (profile === "scientific") args.pauseEducationRuntime();
    if (profile === "scientific") void scienceWorkspace.refreshCapabilities();
    else void scienceWorkspace.cancelCurrentJob();
    if (!announce) return;
    args.setStatus(
      profile === "scientific"
        ? "Scientific workspace selected. V4 education execution is paused; check the local V5 backend."
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
