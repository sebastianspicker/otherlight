/** Re-exports canonical V4 transit-event estimators without a second dynamics path. */
export type { TransitEventEstimate } from "./transitTimingSolve";
export {
  computeTransitReferenceEpochSec,
  estimateTransitEvent,
  estimateTransitEventWithDiagnostics,
} from "./transitTimingSolve";
