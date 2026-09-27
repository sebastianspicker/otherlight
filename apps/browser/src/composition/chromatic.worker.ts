/** Worker entry: retains canonical band runtimes for exactly one scenario generation. */
import { createBandSamplingService, type BandConfiguration } from "../application/runtime/chromaticSampling";
import type { BandRequest } from "../application/runtime/chromaticSampler";

type Message =
  | { kind: "configure"; generation: number; bands: BandConfiguration[] }
  | (BandRequest & { kind: "sample" });
let generation = -1;
let sample: ReturnType<typeof createBandSamplingService> | undefined;
let configurationError: string | undefined;
self.onmessage = (event: MessageEvent<Message>): void => {
  const message = event.data;
  if (message.kind === "configure") {
    generation = message.generation;
    sample = undefined;
    configurationError = undefined;
    try {
      sample = createBandSamplingService(message.bands);
    } catch (error) {
      configurationError = String(error);
    }
    return;
  }
  if (message.generation !== generation) return;
  try {
    if (!sample) throw new Error(configurationError ?? "Chromatic worker is not configured");
    self.postMessage({ generation, requestId: message.requestId, series: sample(message.times) });
  } catch (error) {
    self.postMessage({ generation, requestId: message.requestId, error: String(error) });
  }
};
