export function computeTickLayout(
  lo: number,
  hi: number,
  maxTicks: number,
): { start: number; step: number } | null {
  const range = hi - lo;
  if (range <= 0 || !Number.isFinite(range)) return null;

  const roughStep = range / Math.max(2, maxTicks);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let niceStep: number;
  if (normalized <= 1.5) niceStep = magnitude;
  else if (normalized <= 3.5) niceStep = 2 * magnitude;
  else if (normalized <= 7.5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const start = Math.ceil(lo / niceStep) * niceStep;
  return { start, step: niceStep };
}

export function formatTickValue(v: number, range: number): string {
  if (!Number.isFinite(v)) return "";
  const absV = Math.abs(v);

  if (range < 0.001) return v.toFixed(6);
  if (range < 0.01) return v.toFixed(5);
  if (range < 0.1) return v.toFixed(4);
  if (range < 1) return v.toFixed(3);
  if (absV >= 1e4 || (absV > 0 && absV < 0.01)) return v.toExponential(1);
  if (range < 10) return v.toFixed(2);
  if (range < 100) return v.toFixed(1);
  return v.toFixed(0);
}

type DrawSeriesArgs = {
  ctx: CanvasRenderingContext2D;
  fluxValues: number[];
  timeValues: number[];
  visibleStart: number;
  n: number;
  xIndexOffset: number;
  indexScale: number;
  yOffset: number;
  yScale: number;
  xTimeOffset: number;
  timeScale: number;
  plotW: number;
  haveTime: boolean;
  allFiniteTime: boolean;
};

export function drawLightCurveSeries(args: DrawSeriesArgs): void {
  const {
    ctx,
    fluxValues,
    timeValues,
    visibleStart,
    n,
    xIndexOffset,
    indexScale,
    yOffset,
    yScale,
    xTimeOffset,
    timeScale,
    plotW,
    haveTime,
    allFiniteTime,
  } = args;

  ctx.beginPath();
  ctx.strokeStyle = "#4cc9f0";
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";

  const threshold = plotW * 2;

  if (!haveTime) {
    if (n <= threshold) {
      ctx.moveTo(xIndexOffset, yOffset + fluxValues[visibleStart] * yScale);
      for (let i = 1; i < n; i++) {
        ctx.lineTo(xIndexOffset + i * indexScale, yOffset + fluxValues[visibleStart + i] * yScale);
      }
    } else {
      ctx.moveTo(xIndexOffset, yOffset + fluxValues[visibleStart] * yScale);
      const step = Math.max(1, Math.floor(n / plotW));

      for (let i = 1; i < n; i += step) {
        let chunkMin = Number.POSITIVE_INFINITY;
        let chunkMax = Number.NEGATIVE_INFINITY;
        let chunkMinIdx = -1;
        let chunkMaxIdx = -1;

        const limit = Math.min(n, i + step);
        for (let j = i; j < limit; j++) {
          const v = fluxValues[visibleStart + j];
          if (v < chunkMin) {
            chunkMin = v;
            chunkMinIdx = j;
          }
          if (v > chunkMax) {
            chunkMax = v;
            chunkMaxIdx = j;
          }
        }

        if (chunkMinIdx !== -1 && chunkMaxIdx !== -1) {
          const x = xIndexOffset + Math.floor((i + limit) / 2) * indexScale;
          if (chunkMinIdx <= chunkMaxIdx) {
            ctx.lineTo(x, yOffset + chunkMin * yScale);
            ctx.lineTo(x, yOffset + chunkMax * yScale);
          } else {
            ctx.lineTo(x, yOffset + chunkMax * yScale);
            ctx.lineTo(x, yOffset + chunkMin * yScale);
          }
        }
      }
    }
    ctx.stroke();
    return;
  }

  if (allFiniteTime) {
    if (n <= threshold) {
      ctx.moveTo(
        xTimeOffset + timeValues[visibleStart] * timeScale,
        yOffset + fluxValues[visibleStart] * yScale,
      );
      for (let i = 1; i < n; i++) {
        const index = visibleStart + i;
        ctx.lineTo(xTimeOffset + timeValues[index] * timeScale, yOffset + fluxValues[index] * yScale);
      }
    } else {
      ctx.moveTo(
        xTimeOffset + timeValues[visibleStart] * timeScale,
        yOffset + fluxValues[visibleStart] * yScale,
      );
      const step = Math.max(1, Math.floor(n / plotW));

      for (let i = 1; i < n; i += step) {
        let chunkMin = Number.POSITIVE_INFINITY;
        let chunkMax = Number.NEGATIVE_INFINITY;
        let chunkMinIdx = -1;
        let chunkMaxIdx = -1;

        const limit = Math.min(n, i + step);
        for (let j = i; j < limit; j++) {
          const v = fluxValues[visibleStart + j];
          if (v < chunkMin) {
            chunkMin = v;
            chunkMinIdx = j;
          }
          if (v > chunkMax) {
            chunkMax = v;
            chunkMaxIdx = j;
          }
        }

        if (chunkMinIdx !== -1 && chunkMaxIdx !== -1) {
          const chunkMidIndex = visibleStart + Math.floor((i + limit) / 2);
          const x = xTimeOffset + timeValues[chunkMidIndex] * timeScale;
          if (chunkMinIdx <= chunkMaxIdx) {
            ctx.lineTo(x, yOffset + chunkMin * yScale);
            ctx.lineTo(x, yOffset + chunkMax * yScale);
          } else {
            ctx.lineTo(x, yOffset + chunkMax * yScale);
            ctx.lineTo(x, yOffset + chunkMin * yScale);
          }
        }
      }
    }
    ctx.stroke();
    return;
  }

  const firstTime = timeValues[visibleStart];
  const firstX = Number.isFinite(firstTime) ? xTimeOffset + firstTime * timeScale : xIndexOffset;
  ctx.moveTo(firstX, yOffset + fluxValues[visibleStart] * yScale);

  if (n <= threshold) {
    for (let i = 1; i < n; i++) {
      const index = visibleStart + i;
      const tt = timeValues[index];
      const x = Number.isFinite(tt) ? xTimeOffset + tt * timeScale : xIndexOffset + i * indexScale;
      ctx.lineTo(x, yOffset + fluxValues[index] * yScale);
    }
    ctx.stroke();
    return;
  }

  const step = Math.max(1, Math.floor(n / plotW));
  for (let i = 1; i < n; i += step) {
    let chunkMin = Number.POSITIVE_INFINITY;
    let chunkMax = Number.NEGATIVE_INFINITY;
    let chunkMinIdx = -1;
    let chunkMaxIdx = -1;

    const limit = Math.min(n, i + step);
    for (let j = i; j < limit; j++) {
      const v = fluxValues[visibleStart + j];
      if (v < chunkMin) {
        chunkMin = v;
        chunkMinIdx = j;
      }
      if (v > chunkMax) {
        chunkMax = v;
        chunkMaxIdx = j;
      }
    }

    if (chunkMinIdx !== -1 && chunkMaxIdx !== -1) {
      const chunkMid = Math.floor((i + limit) / 2);
      const chunkMidIndex = visibleStart + chunkMid;
      const tt = timeValues[chunkMidIndex];
      const x = Number.isFinite(tt) ? xTimeOffset + tt * timeScale : xIndexOffset + chunkMid * indexScale;
      if (chunkMinIdx <= chunkMaxIdx) {
        ctx.lineTo(x, yOffset + chunkMin * yScale);
        ctx.lineTo(x, yOffset + chunkMax * yScale);
      } else {
        ctx.lineTo(x, yOffset + chunkMax * yScale);
        ctx.lineTo(x, yOffset + chunkMin * yScale);
      }
    }
  }

  ctx.stroke();
}
