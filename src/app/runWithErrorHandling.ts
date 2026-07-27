/** Runs app actions through the shared fatal-error reporting boundary. */
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

const latestStatusRunIds = new WeakMap<HTMLElement, number>();

function nextStatusRunId(statusEl: HTMLElement | null): number {
  if (!statusEl) return 0;
  const next = (latestStatusRunIds.get(statusEl) ?? 0) + 1;
  latestStatusRunIds.set(statusEl, next);
  return next;
}

function isLatestStatusRun(statusEl: HTMLElement | null, runId: number): boolean {
  if (!statusEl) return true;
  return latestStatusRunIds.get(statusEl) === runId;
}

function successMessage(options: RunWithErrorHandlingOptions): string | undefined {
  if (options.getSuccessMessage === undefined) return undefined;
  return options.getSuccessMessage() ?? "";
}

function setLatestStatusText(statusEl: HTMLElement, runId: number, text: string): void {
  if (!isLatestStatusRun(statusEl, runId)) return;
  statusEl.textContent = text;
}

function setSuccessStatus(options: RunWithErrorHandlingOptions, statusRunId: number): void {
  const message = successMessage(options);
  if (message === undefined || !options.statusEl) return;
  setLatestStatusText(options.statusEl, statusRunId, message);
}

function formatRunError(error: unknown, errorPrefix: string | undefined): string {
  const message = error instanceof Error ? error.message : String(error);
  return errorPrefix ? `${errorPrefix}${message}` : message;
}

function reportRunError(error: unknown, options: RunWithErrorHandlingOptions, statusRunId: number): void {
  const text = formatRunError(error, options.errorPrefix);
  if (!options.statusEl) {
    // Fail-open: no status element available; log to console so errors are never silently dropped.
    console.error("[runWithErrorHandling]", text);
    return;
  }
  setLatestStatusText(options.statusEl, statusRunId, text);
}

async function runAndReport(
  fn: () => void | Promise<void>,
  options: RunWithErrorHandlingOptions,
  statusRunId: number,
): Promise<void> {
  try {
    await Promise.resolve(fn());
    setSuccessStatus(options, statusRunId);
  } catch (error) {
    reportRunError(error, options, statusRunId);
  }
}

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
  const statusRunId = nextStatusRunId(options.statusEl);
  void runAndReport(fn, options, statusRunId);
}
