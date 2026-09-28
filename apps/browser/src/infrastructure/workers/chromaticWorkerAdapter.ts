/** Adapts the application sampler port to an isolated, composition-created module worker. */
import type { ChromaticSampler, BandRequest, BandResponse } from "../../application/runtime/chromaticSampler";
import type { BandConfiguration } from "../../application/runtime/chromaticSampling";

export class ChromaticWorkerAdapter implements ChromaticSampler {
  private worker?: Worker;
  private generation = 0;
  private bands: BandConfiguration[] = [];
  private reject?: (error: Error) => void;
  constructor(private readonly createWorker: () => Worker) {}
  configure(generation: number, bands: BandConfiguration[]): void {
    this.stop();
    this.generation = generation;
    this.bands = bands;
  }
  sample(request: BandRequest): Promise<BandResponse> {
    return new Promise((resolve, reject) => {
      this.reject = reject;
      try {
        if (!this.worker) {
          this.worker = this.createWorker();
          this.worker.postMessage({ kind: "configure", generation: this.generation, bands: this.bands });
        }
        this.worker.onmessage = (event: MessageEvent<BandResponse & { error?: string }>) => {
          this.reject = undefined;
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data);
        };
        this.worker.onerror = () => reject(new Error("Chromatic worker failed to load or execute"));
        this.worker.onmessageerror = () =>
          reject(new Error("Chromatic worker response could not be decoded"));
        this.worker.postMessage({ kind: "sample", ...request });
      } catch (error) {
        reject(error);
      }
    });
  }
  stop(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.reject?.(new Error("Chromatic sampling stopped"));
    this.reject = undefined;
  }
}
