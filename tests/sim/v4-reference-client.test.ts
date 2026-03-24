import { describe, expect, it } from "vitest";
import { buildBinaryLabParams } from "../../src/app/binaryLab";
import { migrateSystemParamsToV4 } from "../../src/sim/v4";
import { createSimulationV4 } from "../../src/sim/v4/runtime";
import { createReferenceSimulationV4, type WorkerLike } from "../../src/sim/v4/referenceClient";
import type { RuntimeModeV4, SimulationConfigV4 } from "../../src/sim/v4/types";

class MockWorker implements WorkerLike {
  private listeners = new Set<(event: MessageEvent<any>) => void>();
  public terminated = false;

  constructor(private readonly respond: (msg: any) => any) {}

  postMessage(msg: unknown): void {
    if (this.terminated) throw new Error("worker terminated");
    const response = this.respond(msg);
    queueMicrotask(() => {
      const event = { data: response } as MessageEvent<any>;
      for (const listener of this.listeners) listener(event);
    });
  }

  addEventListener(type: "message", listener: (event: MessageEvent<any>) => void): void {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(type: "message", listener: (event: MessageEvent<any>) => void): void {
    if (type === "message") this.listeners.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
    this.listeners.clear();
  }
}

function makeConfig(mode: RuntimeModeV4 = "reference"): SimulationConfigV4 {
  const cfg = migrateSystemParamsToV4(buildBinaryLabParams());
  cfg.runtime = { ...(cfg.runtime ?? {}), mode };
  return cfg;
}

describe("v4 reference client", () => {
  it("uses worker step payload in reference mode when available", async () => {
    const cfg = makeConfig("reference");
    const baseline = createSimulationV4(cfg);
    const worker = new MockWorker((msg: any) => {
      if (msg.kind === "init") return { id: msg.id, ok: true };
      if (msg.kind === "mode") return { id: msg.id, ok: true };
      if (msg.kind === "step") {
        const step = baseline.step(msg.tObsSec);
        return {
          id: msg.id,
          ok: true,
          payload: {
            ...step,
            flux: {
              ...step.flux,
              total: step.flux.total + 0.123,
            },
          },
        };
      }
      return { id: msg.id, ok: false, error: "unknown request" };
    });

    const runtime = createReferenceSimulationV4(cfg, {
      workerFactory: () => worker,
    });
    runtime.setMode("reference");
    await runtime.prepare();

    const t = 42;
    const first = runtime.step(t);
    let second = runtime.step(t);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      second = runtime.step(t);
      if (Math.abs(second.flux.total - first.flux.total) > 1e-12) break;
    }

    expect(second.flux.total).toBeCloseTo(first.flux.total + 0.123, 10);
  });

  it("falls back to in-thread runtime when worker init fails", async () => {
    const cfg = makeConfig("reference");
    const runtime = createReferenceSimulationV4(cfg, {
      workerFactory: () => {
        throw new Error("boom");
      },
    });
    runtime.setMode("reference");
    await runtime.prepare();

    const status = runtime.takeStatusMessage();
    expect(status).toContain("using in-thread fallback");

    const step = runtime.step(10);
    expect(Number.isFinite(step.flux.total)).toBe(true);
  });

  it("coalesces step requests while one worker step is in-flight", async () => {
    const cfg = makeConfig("reference");
    const baseline = createSimulationV4(cfg);
    const requestedT: number[] = [];
    const worker = new MockWorker((msg: any) => {
      if (msg.kind === "init") return { id: msg.id, ok: true };
      if (msg.kind === "mode") return { id: msg.id, ok: true };
      if (msg.kind === "step") {
        requestedT.push(msg.tObsSec);
        return { id: msg.id, ok: true, payload: baseline.step(msg.tObsSec) };
      }
      return { id: msg.id, ok: false, error: "unknown request" };
    });
    const runtime = createReferenceSimulationV4(cfg, {
      workerFactory: () => worker,
    });
    runtime.setMode("reference");
    await runtime.prepare();

    runtime.step(10);
    runtime.step(11);
    runtime.step(12);
    runtime.step(13);
    for (let i = 0; i < 20 && requestedT.length < 2; i++) {
      await Promise.resolve();
    }

    expect(requestedT[0]).toBe(10);
    expect(requestedT[requestedT.length - 1]).toBe(13);
    expect(requestedT.length).toBe(2);
  });

  it("ignores invalid worker payload shape and keeps fallback step output", async () => {
    const cfg = makeConfig("reference");
    const worker = new MockWorker((msg: any) => {
      if (msg.kind === "init") return { id: msg.id, ok: true };
      if (msg.kind === "mode") return { id: msg.id, ok: true };
      if (msg.kind === "step") return { id: msg.id, ok: true, payload: { bad: "shape" } };
      return { id: msg.id, ok: false, error: "unknown request" };
    });
    const runtime = createReferenceSimulationV4(cfg, {
      workerFactory: () => worker,
    });
    runtime.setMode("reference");
    await runtime.prepare();
    runtime.takeStatusMessage();

    const first = runtime.step(22);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    const second = runtime.step(22);

    expect(Number.isFinite(first.flux.total)).toBe(true);
    expect(Number.isFinite(second.flux.total)).toBe(true);
    expect(runtime.takeStatusMessage()).toContain("invalid step payload");
    expect(worker.terminated).toBe(true);
  });

  it("falls back when worker returns invalid response envelope", async () => {
    const cfg = makeConfig("reference");
    const worker = new MockWorker((msg: any) => {
      if (msg.kind === "init") return { id: msg.id, ok: true };
      if (msg.kind === "mode") return { id: msg.id, ok: true };
      if (msg.kind === "step") return { id: msg.id, payload: {} };
      return { id: msg.id, ok: false, error: "unknown request" };
    });
    const runtime = createReferenceSimulationV4(cfg, {
      workerFactory: () => worker,
    });
    runtime.setMode("reference");
    await runtime.prepare();
    runtime.takeStatusMessage();

    const first = runtime.step(30);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    const second = runtime.step(30);

    expect(Number.isFinite(first.flux.total)).toBe(true);
    expect(Number.isFinite(second.flux.total)).toBe(true);
    expect(runtime.takeStatusMessage()).toContain("invalid response");
    expect(worker.terminated).toBe(true);
  });

  it("terminates worker when leaving reference mode", async () => {
    const cfg = makeConfig("reference");
    const worker = new MockWorker((msg: any) => ({ id: msg.id, ok: true }));
    const runtime = createReferenceSimulationV4(cfg, {
      workerFactory: () => worker,
    });
    runtime.setMode("reference");
    await runtime.prepare();
    runtime.setMode("realtime");

    expect(worker.terminated).toBe(true);
  });

  it("terminates worker on dispose", async () => {
    const cfg = makeConfig("reference");
    const worker = new MockWorker((msg: any) => ({ id: msg.id, ok: true }));
    const runtime = createReferenceSimulationV4(cfg, {
      workerFactory: () => worker,
    });
    await runtime.prepare();
    runtime.dispose();

    expect(worker.terminated).toBe(true);
    expect(() => runtime.step(1)).toThrow("disposed");
  });
});
