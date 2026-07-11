type OcZeroLineLayout = {
  x0: number;
  pw: number;
};

type OcZeroLineScales = {
  sy: (y: number) => number;
};

export function drawZeroLine(
  ctx: CanvasRenderingContext2D,
  layout: OcZeroLineLayout,
  scales: OcZeroLineScales,
): void {
  const yZero = scales.sy(0);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(layout.x0, yZero);
  ctx.lineTo(layout.x0 + layout.pw, yZero);
  ctx.stroke();
}
