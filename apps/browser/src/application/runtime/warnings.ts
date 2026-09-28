/**
 * Maps collected warnings into the UI warning text.
 */
import type { BrowserScenarioDraft } from "../../domain/model/types";
import { collectParamWarnings } from "../../domain/simulation/validation";

export function uiWarningText(p: BrowserScenarioDraft): string | undefined {
  const msgs = collectParamWarnings(p);
  if (!msgs.length) return undefined;

  // Show all messages of the highest severity level, joined together.
  const warns = msgs.filter((m) => m.severity === "warn");
  const highestSeverity = warns.length > 0 ? warns : msgs.filter((m) => m.severity === "info");
  if (!highestSeverity.length) return undefined;
  // Messages are full sentences; join them as prose rather than with "; ".
  return highestSeverity.map((m) => asSentence(m.message)).join(" ");
}

function asSentence(message: string): string {
  const trimmed = message.trim();
  return /[.!?)]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
