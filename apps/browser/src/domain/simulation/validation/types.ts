/**
 * Owns types support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
export type UiValidationSeverity = "info" | "warn";

export type UiValidationMessage = {
  severity: UiValidationSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
