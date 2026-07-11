type MockCanvasContextOverrides = Record<string, unknown>;

export function makeMockCanvas(
  w = 200,
  h = 100,
  overrides: MockCanvasContextOverrides = {},
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: w,
    height: h,
    top: 0,
    right: w,
    bottom: h,
    left: 0,
    toJSON() {},
  });

  (canvas as any).getContext = () =>
    ({
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
      strokeRect: () => {},
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
      ...overrides,
    }) as unknown as CanvasRenderingContext2D;

  return canvas;
}
