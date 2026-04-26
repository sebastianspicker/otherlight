import { createMock2dContext } from "./canvasContextStub";

const canvasProto = (
  globalThis as typeof globalThis & {
    HTMLCanvasElement?: { prototype?: Record<string, unknown> };
  }
).HTMLCanvasElement?.prototype;

if (canvasProto) {
  Object.defineProperty(canvasProto, "getContext", {
    configurable: true,
    value(this: HTMLCanvasElement, contextId: string) {
      if (contextId !== "2d") return null;
      return createMock2dContext(this);
    },
  });
}
