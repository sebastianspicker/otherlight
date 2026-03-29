import type { SimulationStepV3 } from "../v3";
import { createSimulationV4, type SimulationRuntimeV4 } from "./runtime";
import type { RuntimeModeV4, SimulationConfigV4 } from "./types";
import ReferenceWorker from "./referenceWorker.ts?worker";

type RequestMsg =
  | { id: number; kind: "init"; config: SimulationConfigV4 }
  | { id: number; kind: "step"; tObsSec: number }
  | { id: number; kind: "mode"; mode: RuntimeModeV4 };
type RequestPayload =
  | { kind: "init"; config: SimulationConfigV4 }
  | { kind: "step"; tObsSec: number }
  | { kind: "mode"; mode: RuntimeModeV4 };

type ResponseMsg = { id: number; ok: true; payload?: unknown } | { id: number; ok: false; error: string };

type PendingRequest = {
  resolve: (msg: ResponseMsg) => void;
  reject: (error: Error) => void;
};

export type WorkerLike = {
  postMessage: (msg: unknown) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<ResponseMsg>) => void) => void;
  removeEventListener: (type: "message", listener: (event: MessageEvent<ResponseMsg>) => void) => void;
  terminate: () => void;
};

export type WorkerFactory = () => WorkerLike;

export type ReferenceClientOptions = {
  workerFactory?: WorkerFactory;
};

export type SimulationRuntimeV4WithDispose = SimulationRuntimeV4 & {
  dispose: () => void;
  takeStatusMessage: () => string | undefined;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isResponseMsg(value: unknown): value is ResponseMsg {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ResponseMsg>;
  if (!isFiniteNumber(candidate.id) || typeof candidate.ok !== "boolean") return false;
  if (!candidate.ok) return typeof (candidate as { error?: unknown }).error === "string";
  return true;
}

function isSimulationStepV3Payload(payload: unknown): payload is SimulationStepV3 {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as {
    tObsSec?: unknown;
    flux?: { total?: unknown };
    kinematics?: unknown;
    renderSignals?: unknown;
  };
  return (
    isFiniteNumber(p.tObsSec) &&
    !!p.flux &&
    isFiniteNumber(p.flux.total) &&
    !!p.kinematics &&
    typeof p.kinematics === "object" &&
    !!p.renderSignals &&
    typeof p.renderSignals === "object"
  );
}

function defaultWorkerFactory(): WorkerLike {
  return new ReferenceWorker() as unknown as WorkerLike;
}

export function createReferenceSimulationV4(
  config: SimulationConfigV4,
  options: ReferenceClientOptions = {},
): SimulationRuntimeV4WithDispose {
  const workerFactory = options.workerFactory ?? defaultWorkerFactory;
  const fallback = createSimulationV4(config);
  let mode: RuntimeModeV4 = config.runtime?.mode ?? "realtime";
  let worker: WorkerLike | null = null;
  let initialized = false;
  let disposed = false;
  let nextId = 1;
  let pending = new Map<number, PendingRequest>();
  let lastStatusMessage: string | undefined;
  let inFlightStepT: number | undefined;
  let queuedStepT: number | undefined;
  let lastWorkerStep: SimulationStepV3 | undefined;
  let lastWorkerStepT: number | undefined;

  const onMessage = (event: MessageEvent<ResponseMsg>): void => {
    const msg = event.data;
    if (!isResponseMsg(msg)) {
      lastStatusMessage = "Reference worker returned invalid response; using in-thread fallback.";
      terminateWorker();
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    p.resolve(msg);
  };

  function terminateWorker(): void {
    if (!worker) return;
    worker.removeEventListener("message", onMessage);
    worker.terminate();
    worker = null;
    initialized = false;
    inFlightStepT = undefined;
    queuedStepT = undefined;
    for (const [, p] of pending) {
      p.reject(new Error("Reference worker terminated before completing request."));
    }
    pending = new Map();
  }

  function takeStatusMessage(): string | undefined {
    const out = lastStatusMessage;
    lastStatusMessage = undefined;
    return out;
  }

  async function request(msg: RequestPayload): Promise<ResponseMsg> {
    if (!worker) throw new Error("Reference worker not available.");
    const id = nextId++;
    const payload = { ...msg, id } as RequestMsg;
    const result = await new Promise<ResponseMsg>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        worker!.postMessage(payload);
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  async function prepare(): Promise<void> {
    if (disposed || mode !== "reference" || initialized) return;
    try {
      worker = workerFactory();
      worker.addEventListener("message", onMessage);
      await request({ kind: "init", config });
      initialized = true;
      lastStatusMessage = "Reference worker connected.";
      await request({ kind: "mode", mode });
    } catch (err) {
      terminateWorker();
      const msg = err instanceof Error ? err.message : String(err);
      lastStatusMessage = `Reference worker unavailable, using in-thread fallback: ${msg}`;
    }
  }

  function flushQueuedWorkerStep(): void {
    if (!initialized || !worker || disposed || inFlightStepT !== undefined || queuedStepT === undefined)
      return;
    const tObsSec = queuedStepT;
    queuedStepT = undefined;
    inFlightStepT = tObsSec;
    void request({ kind: "step", tObsSec })
      .then((msg) => {
        if (msg.ok && isSimulationStepV3Payload(msg.payload)) {
          lastWorkerStep = msg.payload;
          lastWorkerStepT = tObsSec;
        } else {
          lastStatusMessage = "Reference worker returned invalid step payload; using in-thread fallback.";
          terminateWorker();
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!lastStatusMessage) {
          lastStatusMessage = `Reference worker step failed, using in-thread fallback: ${msg}`;
        }
        terminateWorker();
      })
      .finally(() => {
        if (inFlightStepT === tObsSec) inFlightStepT = undefined;
        flushQueuedWorkerStep();
      });
  }

  function scheduleWorkerStep(tObsSec: number): void {
    if (!initialized || !worker || disposed) return;
    if (lastWorkerStepT === tObsSec || inFlightStepT === tObsSec || queuedStepT === tObsSec) return;
    queuedStepT = tObsSec;
    flushQueuedWorkerStep();
  }

  return {
    prepare: async () => {
      await fallback.prepare();
      await prepare();
    },
    step: (tObsSec: number): SimulationStepV3 => {
      if (disposed) throw new Error("Reference runtime disposed.");
      if (mode !== "reference") return fallback.step(tObsSec);

      scheduleWorkerStep(tObsSec);
      if (lastWorkerStep && lastWorkerStepT === tObsSec) return lastWorkerStep;
      console.debug("[referenceClient] worker result not yet available for t=%f, using fallback", tObsSec);
      return fallback.step(tObsSec);
    },
    setMode: (next: RuntimeModeV4): void => {
      mode = next;
      fallback.setMode(next);
      if (next !== "reference") {
        terminateWorker();
        return;
      }
      // Fire-and-forget: prepare + mode sync runs in the background.
      void prepare()
        .then(() => {
          if (!initialized) return;
          void request({ kind: "mode", mode: next }).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            lastStatusMessage = `Reference worker mode sync failed: ${msg}`;
          });
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          lastStatusMessage = `Reference worker prepare failed: ${msg}`;
        });
    },
    getMode: (): RuntimeModeV4 => mode,
    getConfig: (): SimulationConfigV4 => fallback.getConfig(),
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      terminateWorker();
    },
    takeStatusMessage,
  };
}
