import { createMock2dContext } from "./canvasContextStub";

export function makeMockCanvas(w = 200, h = 100): HTMLCanvasElement {
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

  (canvas as any).getContext = (contextId: string) => {
    if (contextId !== "2d") return null;
    return createMock2dContext(canvas);
  };

  return canvas;
}
