/** Verifies stellar-disk color parsing at the renderer boundary. */

import { describe, expect, it } from "vitest";
import type { SystemParams } from "../../src/core/types";
import { drawStarDisk } from "../../src/render/starDisk";

function renderedGradientColors(baseColor: string): string[] {
  const colors: string[] = [];
  const gradient = {
    addColorStop(_position: number, color: string): void {
      colors.push(color);
    },
  } as CanvasGradient;
  const context = {
    save() {},
    beginPath() {},
    arc() {},
    fill() {},
    restore() {},
    createRadialGradient: () => gradient,
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  const params = { star: { r: 1 } } as SystemParams;

  drawStarDisk(context, params, {
    centerPx: { x: 0, y: 0 },
    pixelsPerUnit: 10,
    useLimbDarkening: false,
    drawOutline: false,
    nStops: 8,
    baseColor,
  });

  return colors;
}

describe("stellar-disk base colors", () => {
  it("accepts a trimmed six-digit ASCII hex color", () => {
    expect(renderedGradientColors("  #00aF10  ").at(-1)).toBe("rgb(0,175,16)");
  });

  it.each(["#00af1g", "#00af10ff", "00af10"])("falls back for invalid color %s", (color) => {
    expect(renderedGradientColors(color).at(-1)).toBe("rgb(242,163,58)");
  });
});
