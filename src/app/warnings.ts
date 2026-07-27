/**
 * Owns warnings support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { SystemParams } from "../core/types";
import { collectParamWarnings } from "../sim/validation";

export function uiWarningText(p: SystemParams): string | undefined {
  const msgs = collectParamWarnings(p);
  if (!msgs.length) return undefined;

  // Show all messages of the highest severity level, joined together.
  const warns = msgs.filter((m) => m.severity === "warn");
  const highestSeverity = warns.length > 0 ? warns : msgs.filter((m) => m.severity === "info");
  if (!highestSeverity.length) return undefined;
  return highestSeverity.map((m) => m.message).join("; ");
}
