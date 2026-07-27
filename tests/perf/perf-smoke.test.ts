/** Covers perf smoke scenarios used for physics-performance regression checks. */

import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";

import { buildBinaryLabParams, DEFAULT_BINARY_LAB_CONFIG_V4 } from "../../src/app/binaryLab";
import { Canvas2DRenderer } from "../../src/render/canvas2d";
import { createSimulationV4 } from "../../src/sim/v4/runtime";
import { stepSystem } from "../../src/sim/sim";

function makePerfCanvas(w = 960, h = 540): HTMLCanvasElement {
  const canvas = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      width: w,
      height: h,
      top: 0,
      right: w,
      bottom: h,
      left: 0,
      toJSON() {},
    }),
  } as unknown as HTMLCanvasElement;

  const ctx = {
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    ellipse: () => {},
    rect: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: () => {},
    canvas,
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    globalAlpha: 1,
    font: "10px sans-serif",
    lineJoin: "miter" as CanvasLineJoin,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D;

  (canvas as any).getContext = () => ctx;
  return canvas;
}

describe("perf smoke", () => {
  it("steps detached binary scene within budget", () => {
    const system = buildBinaryLabParams();
    const n = 800;
    let t = 0;
    const dt = 5;

    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      t += dt;
      stepSystem(system, t);
    }
    const t1 = performance.now();

    const msPerStep = (t1 - t0) / n;
    expect(Number.isFinite(msPerStep)).toBe(true);
    expect(msPerStep).toBeLessThan(50);
  }, 30_000);

  it("renders detached binary frames within budget", async () => {
    const config = structuredClone(DEFAULT_BINARY_LAB_CONFIG_V4);
    const system = buildBinaryLabParams(config);
    const runtime = createSimulationV4(config);
    const renderer = new Canvas2DRenderer(makePerfCanvas());
    const n = 180;
    let t = 0;
    const dt = 5;
    const frames = [];

    await runtime.prepare();
    for (let i = 0; i < n; i++) {
      t += dt;
      frames.push({ tSec: t, step: runtime.step(t) });
    }

    const t0 = performance.now();
    for (const frame of frames) {
      renderer.drawFrameV3(system, frame.step, frame.tSec);
    }
    const t1 = performance.now();

    const msPerFrame = (t1 - t0) / n;
    expect(Number.isFinite(msPerFrame)).toBe(true);
    expect(msPerFrame).toBeLessThan(20);
  }, 30_000);
});
