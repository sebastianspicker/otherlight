// src/app/runWithErrorHandling.ts
//
// Shared UI error-handling: run a sync or async handler, set a status element on success or error.

export type RunWithErrorHandlingOptions = {
  /** Element to show success or error message (e.g. warnVal, didCompareOut). */
  statusEl: HTMLElement | null;
  /** On success, set statusEl to this (or result of getSuccessMessage()). Omit to leave content unchanged. */
  getSuccessMessage?: () => string | undefined;
  /** Prefix for error message (e.g. "Export failed: "). */
  errorPrefix?: string;
};

/**
 * Runs fn (sync or async). On success, sets statusEl to getSuccessMessage() if provided.
 * On catch, sets statusEl to errorPrefix + error.message.
 */
export function runWithErrorHandling(
  fn: () => void | Promise<void>,
  options: RunWithErrorHandlingOptions,
): void {
  const run = async (): Promise<void> => {
    try {
      await Promise.resolve(fn());
      if (options.statusEl && options.getSuccessMessage !== undefined) {
        options.statusEl.textContent = options.getSuccessMessage() ?? "";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const text = options.errorPrefix ? `${options.errorPrefix}${msg}` : msg;
      if (options.statusEl) options.statusEl.textContent = text;
    }
  };
  void run();
}
