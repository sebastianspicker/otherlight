/**
 * Owns bootstrap Dirty Guard support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
type BootstrapDirtyGuardDeps = {
  form: HTMLFormElement | null;
  uiModeSelect: HTMLSelectElement;
  dirtyState: HTMLElement | null;
  dialog: HTMLDialogElement | null;
  keepEditingButton: HTMLButtonElement | null;
  discardButton: HTMLButtonElement | null;
  applyButton: HTMLButtonElement;
  clearValidation: () => void;
  signal: AbortSignal;
};

export type BootstrapDirtyGuard = {
  setDirty: (next: boolean) => void;
  requestContextChange: (action: () => void) => void;
  guardContextSelect: (select: HTMLSelectElement | null) => void;
};

export function createBootstrapDirtyGuard(deps: BootstrapDirtyGuardDeps): BootstrapDirtyGuard {
  let dirty = false;
  let pendingContextChange: (() => void) | null = null;
  const options = { signal: deps.signal };

  const setDirty = (next: boolean): void => {
    dirty = next;
    if (deps.dirtyState) deps.dirtyState.hidden = !next;
  };

  const requestContextChange = (action: () => void): void => {
    if (!dirty || !deps.dialog || typeof deps.dialog.showModal !== "function") {
      action();
      return;
    }
    pendingContextChange = action;
    deps.dialog.showModal();
  };

  deps.form?.addEventListener(
    "input",
    (event) => {
      if (deps.uiModeSelect.value !== "expert") return;
      if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
      setDirty(true);
      deps.clearValidation();
    },
    options,
  );
  deps.keepEditingButton?.addEventListener(
    "click",
    () => {
      pendingContextChange = null;
      deps.dialog?.close();
      deps.applyButton.focus();
    },
    options,
  );
  deps.discardButton?.addEventListener(
    "click",
    () => {
      const action = pendingContextChange;
      pendingContextChange = null;
      setDirty(false);
      deps.dialog?.close();
      action?.();
    },
    options,
  );

  const guardContextSelect = (select: HTMLSelectElement | null): void => {
    if (!select) return;
    let committedValue = select.value;
    select.addEventListener("focus", () => (committedValue = select.value), options);
    select.addEventListener(
      "change",
      (event) => {
        if (!dirty) {
          committedValue = select.value;
          return;
        }
        const requestedValue = select.value;
        select.value = committedValue;
        event.stopImmediatePropagation();
        requestContextChange(() => {
          select.value = requestedValue;
          committedValue = requestedValue;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
      },
      { capture: true, signal: deps.signal },
    );
  };

  return { setDirty, requestContextChange, guardContextSelect };
}
