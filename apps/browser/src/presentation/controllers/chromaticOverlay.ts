/** Styles asynchronous band samples and retains the last valid same-scenario overlay. */
import {
  buildBandConfigurations,
  type BandConfiguration,
  type BandSamples,
} from "../../application/chromaticSampling";
import { ChromaticSamplingQueue, type ChromaticSampler } from "../../application/chromaticSampler";
import type { AppSimulationRuntime } from "../../application/v4Runtime";
import type { BrowserScenarioDraft } from "../../domain/model/types";
import type { LightCurvePlot } from "../render/lightCurvePlot";
import type { LightCurveOverlaySeries } from "../render/lightCurvePlotTypes";
const COLORS = ["#ffb703", "#8ecae6", "#fb8500", "#90be6d", "#f28482"];
export function styleBandSamples(bands: BandSamples[]): LightCurveOverlaySeries[] {
  return bands.map((band, index) => ({
    ...band,
    id: `band-${index}`,
    color: COLORS[index % COLORS.length],
    style: "solid",
    width: 1.15,
    alpha: 0.75,
  }));
}
export class ChromaticOverlay {
  private runtime?: AppSimulationRuntime;
  private bands: BandConfiguration[] = [];
  private series: LightCurveOverlaySeries[] = [];
  private base: LightCurveOverlaySeries[] = [];
  private suspended = false;
  private lastRequest?: { times: number[]; fixed: boolean };
  private queue: ChromaticSamplingQueue;
  constructor(
    sampler: ChromaticSampler,
    private readonly plot: LightCurvePlot,
    private readonly warn: (message: string) => void,
  ) {
    this.queue = new ChromaticSamplingQueue(
      sampler,
      (series) => {
        this.warn("");
        this.series = styleBandSamples(series);
        this.render();
        plot.draw();
      },
      (error) => warn(`Chromatic overlay unavailable: ${String(error)}`),
    );
  }
  configure(runtime: AppSimulationRuntime, params: BrowserScenarioDraft): void {
    if (this.runtime === runtime) return;
    this.runtime = runtime;
    this.queue.stop();
    this.series = [];
    this.base = [];
    this.lastRequest = undefined;
    this.bands = [];
    this.warn("");
    this.render();
    try {
      this.bands = buildBandConfigurations(params);
      if (!this.suspended) this.queue.configure(this.bands);
    } catch (error) {
      this.warn(`Chromatic overlay unavailable: ${String(error)}`);
    }
  }
  compose(base: LightCurveOverlaySeries[], times: number[], fixed: boolean): void {
    this.base = base;
    this.lastRequest = { times, fixed };
    if (times.length > 0 && this.bands.length > 1 && !this.suspended) this.queue.request(times, fixed);
    this.render();
  }
  updateBase(base: LightCurveOverlaySeries[]): void {
    this.base = base;
    this.render();
  }
  snapshot() {
    return { runtime: this.runtime, base: this.base, series: this.series, request: this.lastRequest };
  }
  clear(): void {
    this.queue.stop();
    if (!this.suspended) this.queue.configure(this.bands);
    this.base = [];
    this.series = [];
    this.lastRequest = undefined;
    this.render();
  }
  restore(snapshot: ReturnType<ChromaticOverlay["snapshot"]>): void {
    if (snapshot.runtime !== this.runtime) return;
    this.clear();
    this.base = snapshot.base;
    this.series = snapshot.series;
    this.lastRequest = snapshot.request;
    if (snapshot.request && !this.suspended && this.hasBands())
      this.queue.request(snapshot.request.times, snapshot.request.fixed);
    this.render();
  }
  hasBands(): boolean {
    return this.bands.length > 1;
  }
  suspend(hidden: boolean): void {
    this.suspended = hidden;
    if (hidden) {
      this.queue.stop();
      return;
    }
    this.queue.configure(this.bands);
    if (this.lastRequest && this.hasBands())
      this.queue.request(this.lastRequest.times, this.lastRequest.fixed);
  }
  dispose(): void {
    this.queue.stop();
  }
  private render(): void {
    this.plot.setOverlaySeries?.([...this.base, ...this.series]);
  }
}
