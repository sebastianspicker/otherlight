/**
 * Guards unsaved authoring changes before a scenario swap.
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
  isDirty: () => boolean;
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

  const confirmDiscardWithoutDialog = (): boolean => {
    if (typeof window.confirm !== "function") return true;
    return window.confirm(
      "Advanced parameter edits have not been applied. Loading another context will discard them.",
    );
  };

  const requestContextChange = (action: () => void): void => {
    if (!dirty) {
      action();
      return;
    }
    if (deps.dialog && typeof deps.dialog.showModal === "function") {
      pendingContextChange = action;
      deps.dialog.showModal();
      return;
    }
    // Without a modal dialog, ask synchronously; clear dirty before acting so
    // the re-dispatched change event is not intercepted again.
    if (!confirmDiscardWithoutDialog()) return;
    setDirty(false);
    action();
  };

  deps.form?.addEventListener(
    "input",
    (event) => {
      if (deps.uiModeSelect.value !== "expert") return;
      if (!event.isTrusted) return;
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
    let redispatching = false;
    select.addEventListener("focus", () => (committedValue = select.value), options);
    select.addEventListener(
      "change",
      (event) => {
        if (redispatching || !dirty) {
          committedValue = select.value;
          return;
        }
        const requestedValue = select.value;
        select.value = committedValue;
        event.stopImmediatePropagation();
        requestContextChange(() => {
          select.value = requestedValue;
          committedValue = requestedValue;
          redispatching = true;
          try {
            select.dispatchEvent(new Event("change", { bubbles: true }));
          } finally {
            redispatching = false;
          }
        });
      },
      { capture: true, signal: deps.signal },
    );
  };

  return { setDirty, isDirty: () => dirty, requestContextChange, guardContextSelect };
}
