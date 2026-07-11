export type FatalErrorRecoveryOptions = {
  reload?: () => void;
};

/** Present an initialization failure in the persistent application shell. */
export function showFatalAppError(error: unknown, options: FatalErrorRecoveryOptions = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const fatal = document.getElementById("fatalError");
  const fatalMessage = document.getElementById("fatalErrorMessage");
  const statusMessage = document.getElementById("appStatusMessage");
  const reload = document.getElementById("fatalReloadBtn") as HTMLButtonElement | null;

  if (fatalMessage) fatalMessage.textContent = `Initialization failed: ${message}`;
  if (fatal) fatal.hidden = false;
  if (statusMessage) {
    statusMessage.textContent = "Initialization failed. Follow the recovery guidance below.";
  }

  const reloadPage = options.reload ?? (() => window.location.reload());
  reload?.addEventListener("click", reloadPage, { once: true });
  fatal?.focus();
}
