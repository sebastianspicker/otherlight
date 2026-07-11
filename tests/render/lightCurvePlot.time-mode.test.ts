// @vitest-environment jsdom
import { expect, it } from "vitest";
import { LightCurvePlot } from "../../src/render/canvas2d";
import { makeMockCanvas } from "../helpers/mockCanvas";

it("draw() keeps the plotted curve readable under robust scaling with a large outlier", () => {
  const canvas = makeMockCanvas(300, 150);
  const curveY: number[] = [];
  let currentStrokeStyle = "#000";
  (canvas as any).getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: (_x: number, y: number) => {
      if (currentStrokeStyle === "#4cc9f0") curveY.push(y);
    },
    lineTo: (_x: number, y: number) => {
      if (currentStrokeStyle === "#4cc9f0") curveY.push(y);
    },
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
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      currentStrokeStyle = typeof value === "string" ? value : currentStrokeStyle;
    },
    fillStyle: "#000",
    globalAlpha: 1,
    font: "10px sans-serif",
    lineJoin: "miter" as CanvasLineJoin,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  });

  const plot = new LightCurvePlot(canvas, 80, {
    xMode: "time",
    trackingMode: "dynamic",
    yScaleMode: "robust",
    yQuantiles: { lo: 0.05, hi: 0.95 },
  });
  for (let i = 0; i < 40; i++) {
    plot.push(1 - i * 0.001, i);
  }
  plot.push(10, 40);

  expect(() => plot.draw()).not.toThrow();
  expect(curveY.length).toBeGreaterThan(10);
  expect(Math.max(...curveY) - Math.min(...curveY)).toBeGreaterThan(20);
});

it("draw() still renders the mean line from the retained visible window when enabled", () => {
  const canvas = makeMockCanvas(300, 150);
  let currentStrokeStyle = "#000";
  let meanLineSegments = 0;
  (canvas as any).getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {
      if (currentStrokeStyle === "rgba(76, 201, 240, 0.4)") meanLineSegments += 1;
    },
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
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      currentStrokeStyle = typeof value === "string" ? value : currentStrokeStyle;
    },
    fillStyle: "#000",
    globalAlpha: 1,
    font: "10px sans-serif",
    lineJoin: "miter" as CanvasLineJoin,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  });

  const plot = new LightCurvePlot(canvas, 12, {
    xMode: "time",
    trackingMode: "dynamic",
    showMeanLine: true,
  });
  for (let i = 0; i < 40; i++) {
    plot.push(1 - i * 0.001, i);
  }

  expect(() => plot.draw()).not.toThrow();
  expect(meanLineSegments).toBeGreaterThan(0);
  expect((plot as any).getVisibleTimeDomain(0, 12)).toEqual({ tMin: 28, tMax: 39 });
});

it("draw() still renders in time mode when some visible samples have no finite time", () => {
  const canvas = makeMockCanvas(300, 150);
  const lineToCalls: Array<{ x: number; y: number }> = [];
  (canvas as any).getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: (x: number, y: number) => {
      lineToCalls.push({ x, y });
    },
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
  });

  const plot = new LightCurvePlot(canvas, 12, {
    xMode: "time",
    trackingMode: "dynamic",
  });
  plot.push(1, 0);
  plot.push(0.999, 1);
  plot.push(0.998);
  plot.push(0.997, 3);

  expect(() => plot.draw()).not.toThrow();
  expect(lineToCalls.length).toBeGreaterThan(0);
  expect((plot as any).getVisibleTimeDomain(0, 4)).toEqual({ tMin: 0, tMax: 3 });
});

it("draw() still renders time-axis labels in time mode", () => {
  const canvas = makeMockCanvas(300, 150);
  const fillTextCalls: string[] = [];
  (canvas as any).getContext = () => ({
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
    fillText: (text: string) => {
      fillTextCalls.push(text);
    },
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
  });

  const plot = new LightCurvePlot(canvas, 12, {
    xMode: "time",
    trackingMode: "dynamic",
  });
  for (let i = 0; i < 8; i++) {
    plot.push(1 - i * 0.001, i);
  }

  expect(() => plot.draw()).not.toThrow();
  expect(fillTextCalls).toContain("t [s]");
  expect(fillTextCalls.length).toBeGreaterThan(4);
});

it("draw() uses non-uniform time spacing for all-finite time windows", () => {
  const canvas = makeMockCanvas(300, 150);
  const curveX: number[] = [];
  let currentStrokeStyle = "#000";
  (canvas as any).getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: (x: number) => {
      if (currentStrokeStyle === "#4cc9f0") curveX.push(x);
    },
    lineTo: (x: number) => {
      if (currentStrokeStyle === "#4cc9f0") curveX.push(x);
    },
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
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      currentStrokeStyle = typeof value === "string" ? value : currentStrokeStyle;
    },
    fillStyle: "#000",
    globalAlpha: 1,
    font: "10px sans-serif",
    lineJoin: "miter" as CanvasLineJoin,
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  });

  const plot = new LightCurvePlot(canvas, 12, {
    xMode: "time",
    trackingMode: "dynamic",
  });
  plot.push(1, 0);
  plot.push(0.999, 1);
  plot.push(0.998, 3);
  plot.push(0.997, 6);

  expect(() => plot.draw()).not.toThrow();
  expect(curveX.length).toBeGreaterThanOrEqual(4);
  const dx1 = curveX[1] - curveX[0];
  const dx2 = curveX[2] - curveX[1];
  expect(dx2).toBeGreaterThan(dx1);
});

it("live time mode falls back safely when the last cached finite time is trimmed out by later non-finite samples", () => {
  const canvas = makeMockCanvas(300, 150);
  const plot = new LightCurvePlot(canvas, 6, {
    xMode: "time",
    trackingMode: "live",
    dynamicWindowSec: 2,
    dynamicWindowSamples: 4,
  });

  plot.push(1, 100);
  for (let i = 0; i < 11; i++) {
    plot.push(1 - i * 1e-3);
  }

  const bounds = (plot as any).getVisibleSampleBounds();
  expect(bounds.end - bounds.start).toBe(4);
  expect((plot as any).getVisibleTimeDomain(bounds.start, bounds.end)).toBeNull();
  expect(() => plot.draw()).not.toThrow();
});

it("dynamic time mode falls back safely when the earliest cached finite time is trimmed out by later non-finite samples", () => {
  const canvas = makeMockCanvas(300, 150);
  const plot = new LightCurvePlot(canvas, 6, {
    xMode: "time",
    trackingMode: "dynamic",
  });

  plot.push(1, 10);
  plot.push(0.999, 11);
  for (let i = 0; i < 10; i++) {
    plot.push(0.998 - i * 1e-3);
  }

  const bounds = (plot as any).getVisibleSampleBounds();
  expect(bounds.end - bounds.start).toBe(10);
  expect((plot as any).getVisibleTimeDomain(bounds.start, bounds.end)).toBeNull();
  expect(() => plot.draw()).not.toThrow();
});
