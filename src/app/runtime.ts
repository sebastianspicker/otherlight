import { clamp } from "../core/units";

export function computeFrameDt(now: number, last: number): number {
  return clamp((now - last) / 1000, 0, 0.1);
}
