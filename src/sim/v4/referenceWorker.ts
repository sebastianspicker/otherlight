import { createSimulationV4 } from "./runtime";
import { isSimulationConfigV4 } from "./migrate";
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

function isRequestMsg(msg: unknown): msg is RequestMsg {
  if (!msg || typeof msg !== "object") return false;
  const candidate = msg as Partial<RequestMsg>;
  if (!Number.isFinite(candidate.id)) return false;
  if (candidate.kind === "init") return isSimulationConfigV4(candidate.config);
  if (candidate.kind === "step") return Number.isFinite(candidate.tObsSec);
  if (candidate.kind === "mode") return candidate.mode === "realtime" || candidate.mode === "reference";
  return false;
}

self.addEventListener("message", async (ev: MessageEvent<RequestMsg>) => {
  const msg = ev.data;
  const id =
    typeof msg === "object" && msg !== null && Number.isFinite((msg as RequestMsg).id)
      ? (msg as RequestMsg).id
      : NaN;
  try {
    if (!isRequestMsg(msg)) {
      post({ id: Number.isFinite(id) ? id : 0, ok: false, error: "referenceWorker: invalid message shape." });
      return;
    }
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
    post({
      id: Number.isFinite(id) ? id : 0,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
