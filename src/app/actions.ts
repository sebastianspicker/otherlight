import { clamp, toFiniteNumber } from "../core/units";
import { setText } from "../core/dom";
import type { NoiseState } from "./noise";
import { resetNoiseStateWithSeed } from "./noise";

/** Frame delta in seconds, clamped to [0, 0.1] for tab-switch / lag spikes. */
export function computeFrameDt(now: number, last: number): number {
  return clamp((now - last) / 1000, 0, 0.1);
}

export function setRunningState(
  next: boolean,
  btnStart: HTMLButtonElement,
): { running: boolean; last: number } {
  const running = next;
  btnStart.textContent = running ? "Stop" : "Start";
  return { running, last: performance.now() };
}

export function resetNoiseState(noise: NoiseState): NoiseState {
  return { ...noise, noiseState: resetNoiseStateWithSeed(noise.noiseSeed) };
}

export function syncSliderMirrorsFromInputs(): void {
  const root = document.getElementById("paramForm") ?? document.getElementById("main");
  if (!root) return;
  const nums = Array.from(root.querySelectorAll("input[type='number']")) as HTMLInputElement[];
  for (const num of nums) {
    num.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function readTimeSpeed(
  timeSpeed: HTMLInputElement,
  timeSpeedVal?: HTMLElement | null,
  timeSpeedMultiplier?: HTMLSelectElement | null,
): number {
  const v = toFiniteNumber(timeSpeed.value, 1);
  const multiplierRaw = toFiniteNumber(timeSpeedMultiplier?.value ?? "1", 1);
  const multiplier = clamp(multiplierRaw, 1, 1024);
  const speed = clamp(v, 0, 100_000);
  const effectiveSpeed = clamp(speed * multiplier, 0, 100_000_000);
  if (timeSpeedVal) setText(timeSpeedVal, `${Math.round(effectiveSpeed)}`);
  return effectiveSpeed;
}
