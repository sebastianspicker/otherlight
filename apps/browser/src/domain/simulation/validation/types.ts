/**
 * Defines the UI validation message and severity types.
 */
export type UiValidationSeverity = "info" | "warn";

export type UiValidationMessage = {
  severity: UiValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
