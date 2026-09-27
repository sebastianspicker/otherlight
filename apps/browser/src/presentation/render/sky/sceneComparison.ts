/** Draws labelled comparison outlines without changing physical geometry. */
import type { SceneGhostGeometry, ScratchPoint, ToPxInto } from "./sceneTypes";

export const drawGhostGeometry = (args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  ghost: SceneGhostGeometry;
  labelIndex: number;
}): void => {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, ghost, labelIndex } = args;
  const color = ghost.color ?? "rgba(255,255,255,0.28)";
  for (const geometry of ghost.geometry) {
    const p = toPxInto(geometry.center.x, geometry.center.y, scratchPoint);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.setLineDash(labelIndex % 2 === 0 ? [5, 4] : []);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    if (geometry.kind === "circle") {
      ctx.arc(p.x, p.y, geometry.radius * pixelsPerUnit, 0, Math.PI * 2);
    } else if (geometry.kind === "ellipse") {
      ctx.ellipse(
        p.x,
        p.y,
        geometry.rx * pixelsPerUnit,
        geometry.ry * pixelsPerUnit,
        geometry.angle,
        0,
        Math.PI * 2,
      );
    } else {
      const q = Math.max(
        0.05,
        Math.abs(Math.cos(Number.isFinite(geometry.inclination) ? geometry.inclination : 0)),
      );
      ctx.ellipse(
        p.x,
        p.y,
        geometry.outerRadius * pixelsPerUnit,
        geometry.outerRadius * pixelsPerUnit * q,
        geometry.angle,
        0,
        Math.PI * 2,
      );
      ctx.moveTo(p.x + geometry.innerRadius * pixelsPerUnit, p.y);
      ctx.ellipse(
        p.x,
        p.y,
        geometry.innerRadius * pixelsPerUnit,
        geometry.innerRadius * pixelsPerUnit * q,
        geometry.angle,
        0,
        Math.PI * 2,
      );
    }
    ctx.strokeStyle = "#0b1319";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    const side = labelIndex % 2 === 0 ? -1 : 1;
    const labelX = p.x + side * (ghost.label.length === 1 ? 145 : 70);
    const labelY = p.y - 48;
    ctx.beginPath();
    ctx.moveTo(p.x + side * 12, p.y - 12);
    ctx.lineTo(labelX, labelY);
    ctx.stroke();
    ctx.font = "16px system-ui, sans-serif";
    ctx.textAlign = side < 0 ? "right" : "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(ghost.label, labelX + side * 5, labelY);
    ctx.restore();
  }
};
