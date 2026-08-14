// @vitest-environment jsdom

import { expect, it } from "vitest";
import { drawMarkers, drawOverlaySeries } from "../../src/render/lightCurvePlotAnnotations";
import type { TimeScaleInfo } from "../../src/render/lightCurvePlotAxes";

function makeRecordingContext(): {
  ctx: CanvasRenderingContext2D;
  operations: string[];
  points: Array<[string, number, number]>;
  arcs: Array<[number, number, number]>;
  labels: Array<[string, number, number]>;
} {
  const operations: string[] = [];
  const points: Array<[string, number, number]> = [];
  const arcs: Array<[number, number, number]> = [];
  const labels: Array<[string, number, number]> = [];
  const context = {
    save: () => operations.push("save"),
    restore: () => operations.push("restore"),
    beginPath: () => operations.push("beginPath"),
    moveTo: (x: number, y: number) => points.push(["moveTo", x, y]),
    lineTo: (x: number, y: number) => points.push(["lineTo", x, y]),
    stroke: () => operations.push("stroke"),
    fill: () => operations.push("fill"),
    arc: (x: number, y: number, radius: number) => arcs.push([x, y, radius]),
    fillRect: (x: number, y: number, width: number, height: number) =>
      operations.push(`fillRect:${x},${y},${width},${height}`),
    fillText: (text: string, x: number, y: number) => labels.push([text, x, y]),
    measureText: (text: string) => ({ width: text.length * 6 }),
    setLineDash: (segments: number[]) => operations.push(`dash:${segments.join(",")}`),
  };
  Object.defineProperties(context, {
    strokeStyle: { set: (value: string) => operations.push(`strokeStyle:${value}`) },
    fillStyle: { set: (value: string) => operations.push(`fillStyle:${value}`) },
    globalAlpha: { set: (value: number) => operations.push(`alpha:${value}`) },
    lineWidth: { set: (value: number) => operations.push(`lineWidth:${value}`) },
    font: { set: (value: string) => operations.push(`font:${value}`) },
    textAlign: { set: (value: string) => operations.push(`textAlign:${value}`) },
    textBaseline: { set: (value: string) => operations.push(`textBaseline:${value}`) },
  });
  return { ctx: context as unknown as CanvasRenderingContext2D, operations, points, arcs, labels };
}

const timeInfo: TimeScaleInfo = {
  haveTime: true,
  allFiniteTime: true,
  tMin: 0,
  tMax: 10,
  tSpan: 10,
  timeScale: 10,
  xTimeOffset: 10,
  plotW: 100,
  marginLeft: 20,
};

it("filters and styles overlay samples while retaining later off-plot points", () => {
  const { ctx, operations, points } = makeRecordingContext();
  drawOverlaySeries({
    ctx,
    series: {
      id: "comparison",
      label: "comparison",
      color: "#4cc9f0",
      alpha: 0.05,
      width: 0.1,
      style: "dashed",
      samples: [
        { t: Number.NaN, flux: 1 },
        { t: -1, flux: 1 },
        { t: 0, flux: 1 },
        { t: 1, flux: 100 },
        { t: 0.8, flux: 1 },
        { t: 1, flux: 100 },
        { t: 10, flux: 2 },
        { t: 11, flux: 2 },
      ],
    },
    yOf: (flux) => flux * 10 + 30,
    timeInfo,
    marginLeft: 20,
    plotW: 100,
    marginTop: 30,
    plotH: 50,
  });

  expect(operations).toContain("strokeStyle:#4cc9f0");
  expect(operations).toContain("alpha:0.1");
  expect(operations).toContain("lineWidth:0.75");
  expect(operations).toContain("dash:7,4");
  expect(operations.filter((operation) => operation === "save")).toHaveLength(1);
  expect(operations.filter((operation) => operation === "restore")).toHaveLength(1);
  expect(operations.filter((operation) => operation === "stroke")).toHaveLength(1);
  expect(points).toEqual([
    ["moveTo", 18, 40],
    ["lineTo", 20, 1030],
    ["lineTo", 110, 50],
  ]);

  operations.length = 0;
  drawOverlaySeries({
    ctx,
    series: { id: "no-time", label: "no-time", color: "#000", samples: [{ t: 1, flux: 1 }] },
    yOf: (flux) => flux,
    timeInfo: { ...timeInfo, haveTime: false },
    marginLeft: 20,
    plotW: 100,
    marginTop: 30,
    plotH: 50,
  });
  expect(operations).toEqual([]);
});

it("draws inclusive marker boundaries with clamped labels and ticks", () => {
  const { ctx, operations, points, arcs, labels } = makeRecordingContext();
  drawMarkers({
    ctx,
    markers: [
      { id: "nan", tSec: Number.NaN, label: "nan", kind: "timing" },
      { id: "outside-time", tSec: -1, label: "outside", kind: "timing" },
      { id: "outside-x", tSec: 0, label: "outside", kind: "timing" },
      { id: "left", tSec: 1, label: "L", kind: "timing" },
      {
        id: "right",
        tSec: 10,
        label: "right",
        kind: "contact",
        align: "bottom",
        color: "#ffb703",
        emphasized: true,
      },
    ],
    timeInfo,
    yOf: () => 50,
    marginLeft: 20,
    marginTop: 30,
    plotW: 100,
    plotH: 50,
  });

  expect(operations).toEqual([
    "save",
    "strokeStyle:rgba(255, 214, 102, 0.92)",
    "alpha:0.7",
    "lineWidth:1",
    "dash:4,4",
    "beginPath",
    "stroke",
    "dash:",
    "fillStyle:rgba(6, 10, 16, 0.84)",
    "fillRect:20,35,16,12",
    "fillStyle:rgba(255, 214, 102, 0.92)",
    "font:11px ui-monospace, SFMono-Regular, Menlo, monospace",
    "textAlign:center",
    "textBaseline:top",
    "beginPath",
    "fillStyle:rgba(255, 214, 102, 0.92)",
    "fill",
    "restore",
    "save",
    "strokeStyle:#ffb703",
    "alpha:0.95",
    "lineWidth:1.5",
    "dash:2,3",
    "beginPath",
    "stroke",
    "dash:",
    "fillStyle:rgba(6, 10, 16, 0.84)",
    "fillRect:80,65,40,12",
    "fillStyle:#ffb703",
    "font:11px ui-monospace, SFMono-Regular, Menlo, monospace",
    "textAlign:center",
    "textBaseline:top",
    "beginPath",
    "fillStyle:#ffb703",
    "fill",
    "restore",
  ]);
  expect(points).toEqual([
    ["moveTo", 20, 30],
    ["lineTo", 20, 80],
    ["moveTo", 110, 30],
    ["lineTo", 110, 80],
  ]);
  expect(labels).toEqual([
    ["L", 28, 36],
    ["right", 100, 66],
  ]);
  expect(arcs).toEqual([
    [20, 50, 2.2],
    [110, 77, 2.2],
  ]);

  operations.length = 0;
  drawMarkers({
    ctx,
    markers: [{ id: "no-time", tSec: 1, label: "ignored", kind: "timing" }],
    timeInfo: { ...timeInfo, haveTime: false },
    yOf: () => 1,
    marginLeft: 20,
    marginTop: 30,
    plotW: 100,
    plotH: 50,
  });
  expect(operations).toEqual([]);
});
