/** Verifies worker parity, bounded scheduling, stale-response rejection, and failure isolation. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChromaticSamplingQueue,
  type BandRequest,
  type BandResponse,
  type ChromaticSampler,
} from "../../src/application/chromaticSampler";
import { buildBandConfigurations, createBandSamplingService } from "../../src/application/chromaticSampling";
import { getPresetById } from "../../src/application/presets";
import { createSimulationV4 } from "../../src/domain/simulation/v4";
import { ChromaticWorkerAdapter } from "../../src/infrastructure/workers/chromaticWorkerAdapter";
function harness() {
  const requests: Array<{
    request: BandRequest;
    resolve: (response: BandResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  const sampler: ChromaticSampler = {
    configure: vi.fn(),
    stop: vi.fn(),
    sample: (request) => new Promise((resolve, reject) => requests.push({ request, resolve, reject })),
  };
  const publish = vi.fn();
  const failure = vi.fn();
  const queue = new ChromaticSamplingQueue(sampler, publish, failure);
  queue.configure([]);
  const complete = async (index: number) => {
    const item = requests[index];
    item.resolve({ ...item.request, series: [] });
    await Promise.resolve();
  };
  return { queue, requests, complete, publish, failure, sampler };
}
afterEach(() => vi.useRealTimers());
describe("chromatic scheduling", () => {
  it("starts at most every 100 ms independently of frames and replaces pending work", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.queue.request([0], false);
    for (let i = 1; i <= 20; i++) h.queue.request([i], false);
    expect(h.requests).toHaveLength(1);
    await h.complete(0);
    expect(h.publish).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(h.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.requests).toHaveLength(2);
    expect(h.requests[1].request.times).toEqual([20]);
    h.queue.stop();
  });
  it("publishes slow completed current work even with a newer pending request", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.queue.request([0], false);
    h.queue.request([1], false);
    await vi.advanceTimersByTimeAsync(350);
    await h.complete(0);
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.requests).toHaveLength(2);
    h.queue.stop();
  });
  it("rejects obsolete generations and cancels hidden/disposed pending work", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.queue.request([0], true);
    h.queue.request([1], true);
    h.queue.configure([]);
    h.queue.request([2], true);
    await h.complete(0);
    expect(h.publish).not.toHaveBeenCalled();
    await h.complete(1);
    expect(h.publish).toHaveBeenCalledTimes(1);
    h.queue.request([3], false);
    h.queue.stop();
    await vi.runAllTimersAsync();
    expect(h.requests).toHaveLength(2);
  });
  it("reports worker failure once without breaking the primary caller", async () => {
    const h = harness();
    h.queue.request([0], true);
    h.requests[0].reject(new Error("worker unavailable"));
    await Promise.resolve();
    expect(h.failure).toHaveBeenCalledTimes(1);
    h.queue.request([1], true);
    expect(h.requests).toHaveLength(1);
  });
});
describe("retained band runtimes", () => {
  it("matches independent synchronous sampling across repeated requests and backward times", () => {
    const params = structuredClone(getPresetById("default").params);
    params.star.photometry = {
      ...params.star.photometry,
      spectralBandpass: { enabled: true, lambdaNm: [450, 550, 700], weights: [1, 2, 1] },
    };
    const configs = buildBandConfigurations(params);
    expect(configs).toHaveLength(3);
    const sample = createBandSamplingService(configs);
    for (const times of [
      [-100, 0, 100],
      [200, 300],
      [-300, -200],
    ]) {
      const expected = configs.map(({ label, configuration }) => {
        const runtime = createSimulationV4(configuration, {});
        return {
          label,
          samples: times.map((t) => {
            const step = runtime.step(t);
            return {
              t,
              flux: Number.isFinite(step.debug?.displayFluxValue)
                ? step.debug!.displayFluxValue
                : step.flux.total,
            };
          }),
        };
      });
      expect(sample(times)).toEqual(expected);
    }
  });
  it("sends configurations once per worker generation and terminates on stop", async () => {
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null as ((event: { data: unknown }) => void) | null,
    };
    const create = vi.fn(() => worker as unknown as Worker);
    const adapter = new ChromaticWorkerAdapter(create);
    adapter.configure(4, []);
    for (const requestId of [1, 2]) {
      const promise = adapter.sample({ generation: 4, requestId, times: [0] });
      worker.onmessage!({ data: { generation: 4, requestId, series: [] } });
      await promise;
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(worker.postMessage.mock.calls.filter(([message]) => message.kind === "configure")).toHaveLength(1);
    adapter.stop();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
