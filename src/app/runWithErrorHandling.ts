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
 *
 * This is a fire-and-forget wrapper: the returned `void` intentionally discards the
 * internal Promise so callers do not need to await. If a caller needs the resolved
 * value or wants to propagate errors, use try/catch directly instead of this helper.
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
      if (options.statusEl) {
        options.statusEl.textContent = text;
      } else {
        // Fail-open: no status element available; log to console so errors are never silently dropped.
        console.error("[runWithErrorHandling]", text);
      }
    }
  };
  void run();
}
