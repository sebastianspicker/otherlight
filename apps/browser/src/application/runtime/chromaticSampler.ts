/** Bounds asynchronous chromatic work to one active and one replaceable pending request. */
import type { BandConfiguration, BandSamples } from "./chromaticSampling";

export type BandRequest = { generation: number; requestId: number; times: number[] };
export type BandResponse = { generation: number; requestId: number; series: BandSamples[] };
export interface ChromaticSampler {
  configure(generation: number, bands: BandConfiguration[]): void;
  sample(request: BandRequest): Promise<BandResponse>;
  stop(): void;
}
export type SamplerClock = {
  now(): number;
  schedule(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel(timer: ReturnType<typeof setTimeout>): void;
};
const clock: SamplerClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (timer) => clearTimeout(timer),
};

export class ChromaticSamplingQueue {
  private generation = 0;
  private requestId = 0;
  private active?: BandRequest;
  private pending?: { times: number[]; fixed: boolean };
  private timer?: ReturnType<typeof setTimeout>;
  private lastStarted = -Infinity;
  private stopped = false;
  private failed = false;
  constructor(
    private readonly sampler: ChromaticSampler,
    private readonly publish: (series: BandSamples[]) => void,
    private readonly failure: (error: unknown) => void,
    private readonly time: SamplerClock = clock,
  ) {}

  configure(bands: BandConfiguration[]): void {
    this.stop();
    this.stopped = false;
    this.failed = false;
    this.lastStarted = -Infinity;
    this.sampler.configure(this.generation, bands);
  }
  request(times: number[], fixed: boolean): void {
    if (this.stopped || this.failed) return;
    this.pending = { times, fixed };
    this.drain();
  }
  stop(): void {
    this.generation++;
    this.stopped = true;
    this.active = undefined;
    this.pending = undefined;
    if (this.timer !== undefined) this.time.cancel(this.timer);
    this.timer = undefined;
    this.sampler.stop();
  }
  private drain(): void {
    if (this.active || !this.pending || this.timer !== undefined) return;
    const delay = this.pending.fixed ? 0 : Math.max(0, 100 - (this.time.now() - this.lastStarted));
    if (delay > 0) {
      this.timer = this.time.schedule(() => {
        this.timer = undefined;
        this.drain();
      }, delay);
      return;
    }
    const request = { generation: this.generation, requestId: ++this.requestId, times: this.pending.times };
    this.pending = undefined;
    this.active = request;
    this.lastStarted = this.time.now();
    void this.execute(request);
  }
  private async execute(request: BandRequest): Promise<void> {
    try {
      const response = await this.sampler.sample(request);
      if (this.active !== request) return;
      if (response.generation !== this.generation || response.requestId !== request.requestId) {
        throw new Error("Mismatched chromatic worker response");
      }
      this.publish(response.series);
    } catch (error) {
      if (this.active !== request) return;
      this.failed = true;
      this.pending = undefined;
      this.sampler.stop();
      this.failure(error);
    } finally {
      if (this.active === request) {
        this.active = undefined;
        this.drain();
      }
    }
  }
}
