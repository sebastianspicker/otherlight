/** Protects the frame loop's explicit unavailable-state contract. */
import { describe, expect, it } from "vitest";

import type { AppSimulationRuntime } from "../../src/application/v4Runtime";
import type { SimulationFrame } from "../../src/domain/simulation/frames";
import { trySimulationStep } from "../../src/presentation/controllers/frameLoopControllerShared";
import type {
  FrameLoopContext,
  FrameLoopState,
} from "../../src/presentation/controllers/frameLoopControllerTypes";

const frame = { tObsSec: 12 } as SimulationFrame;

function context(lastValidFrame: SimulationFrame | null): FrameLoopContext {
  return { state: { lastValidFrame } as FrameLoopState } as FrameLoopContext;
}

describe("frame-loop runtime failures", () => {
  it("returns an explicit error without fabricating a simulation frame", () => {
    const ctx = context(null);
    const runtime = {
      step: () => {
        throw new Error("invalid orbit");
      },
    } as AppSimulationRuntime;

    expect(trySimulationStep(ctx, runtime, 12)).toEqual({
      ok: false,
      errorMessage: "invalid orbit",
    });
    expect(ctx.state.lastValidFrame).toBeNull();
  });

  it("keeps the last valid frame separate from a later failure", () => {
    const ctx = context(null);
    const validRuntime = { step: () => frame } as AppSimulationRuntime;
    expect(trySimulationStep(ctx, validRuntime, 12)).toEqual({ ok: true, step: frame });

    const failingRuntime = {
      step: () => {
        throw new Error("integration failed");
      },
    } as AppSimulationRuntime;
    expect(trySimulationStep(ctx, failingRuntime, 13).ok).toBe(false);
    expect(ctx.state.lastValidFrame).toBe(frame);
  });
});
