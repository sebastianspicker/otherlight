import { createSimulationV4, type SimulationRuntimeV4 } from "./runtime";
import type { SimulationConfigV4 } from "./types";

export type WorkerLike = {
  postMessage: (msg: unknown) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<unknown>) => void) => void;
  removeEventListener: (type: "message", listener: (event: MessageEvent<unknown>) => void) => void;
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

export function createReferenceSimulationV4(
  config: SimulationConfigV4,
  _options: ReferenceClientOptions = {},
): SimulationRuntimeV4WithDispose {
  const runtime = createSimulationV4(config);
  let disposed = false;
  let statusMessage: string | undefined =
    "Reference mode runs on the in-thread deterministic runtime; the worker handoff has been retired.";

  return {
    prepare: async () => {
      await runtime.prepare();
    },
    step: (tObsSec) => {
      if (disposed) throw new Error("Reference runtime disposed.");
      return runtime.step(tObsSec);
    },
    setMode: (mode) => {
      runtime.setMode(mode);
    },
    getMode: () => runtime.getMode(),
    getConfig: () => runtime.getConfig(),
    dispose: () => {
      disposed = true;
    },
    takeStatusMessage: () => {
      const out = statusMessage;
      statusMessage = undefined;
      return out;
    },
  };
}
