import type { SystemParams } from "../core/types";
import { collectParamWarnings } from "../sim/validation";

export function uiWarningText(p: SystemParams): string | undefined {
  const msgs = collectParamWarnings(p);
  if (!msgs.length) return undefined;

  const best = msgs.find((m) => m.severity === "warn") ?? msgs.find((m) => m.severity === "info");
  return best?.message;
}
