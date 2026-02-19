import { createSimulationV4 } from "./runtime";
import type { SimulationConfigV4 } from "./types";

type RequestMsg =
  | { id: number; kind: "init"; config: SimulationConfigV4 }
  | { id: number; kind: "step"; tObsSec: number }
  | { id: number; kind: "mode"; mode: "realtime" | "reference" };

type ResponseMsg = { id: number; ok: true; payload?: unknown } | { id: number; ok: false; error: string };

let sim: ReturnType<typeof createSimulationV4> | null = null;

function post(msg: ResponseMsg): void {
  (self as unknown as Worker).postMessage(msg);
}

self.addEventListener("message", async (ev: MessageEvent<RequestMsg>) => {
  const msg = ev.data;
  try {
    if (msg.kind === "init") {
      sim = createSimulationV4(msg.config);
      await sim.prepare();
      post({ id: msg.id, ok: true });
      return;
    }
    if (!sim) throw new Error("referenceWorker: simulation not initialized.");
    if (msg.kind === "mode") {
      sim.setMode(msg.mode);
      post({ id: msg.id, ok: true });
      return;
    }
    if (msg.kind === "step") {
      const step = sim.step(msg.tObsSec);
      post({ id: msg.id, ok: true, payload: step });
      return;
    }
    throw new Error("referenceWorker: unknown message.");
  } catch (e) {
    post({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
