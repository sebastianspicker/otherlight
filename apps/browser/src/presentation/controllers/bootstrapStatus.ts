/**
 * Owns bootstrap Status support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
export type BootstrapStatusWriter = (message: string) => void;

export const createBootstrapStatusWriter =
  (appStatus: HTMLElement | null, appStatusMessage: HTMLElement | null): BootstrapStatusWriter =>
  (message) => {
    if (appStatusMessage) appStatusMessage.textContent = message;
    else if (appStatus) appStatus.textContent = message;
  };
