// src/ui/sliders.ts
//
// Optional: slider mirroring for number inputs.

import { clamp, toFiniteNumber } from "../core/units";
import type { UiRefs } from "./refs";

export function wireParamSliders(r: UiRefs): void {
  if (!r.sliderRootEl) return;

  const isOverrideOn = () => Boolean(r.overrideModeEl?.checked);

  // Keep slider root visible; override changes only clamp policy.
  r.sliderRootEl.style.display = "";

  const nums = Array.from(document.querySelectorAll("#paramForm input[type='number']")) as HTMLInputElement[];

  for (const num of nums) {
    const minAttr = num.getAttribute("min");
    const maxAttr = num.getAttribute("max");
    if (minAttr === null || maxAttr === null) continue;

    const min = Number(minAttr);
    const max = Number(maxAttr);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) continue;

    const stepAttr = num.getAttribute("step");
    const step = stepAttr ? Number(stepAttr) : (max - min) / 500;
    const safeStep = Number.isFinite(step) && step > 0 ? step : (max - min) / 500;

    const row = document.createElement("div");
    row.className = "row";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = num.id || "param";

    const range = document.createElement("input");
    range.type = "range";
    range.id = `slider-${num.id || "param"}`;
    range.setAttribute("aria-label", num.id || "parameter slider");
    range.min = String(min);
    range.max = String(max);
    range.step = String(safeStep);
    range.value = String(clamp(toFiniteNumber(num.value, min), min, max));

    // Slider -> Number
    range.addEventListener("input", () => {
      num.value = range.value;
      num.dispatchEvent(new Event("input", { bubbles: true }));
      num.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Number -> Slider (and clamp when override OFF)
    num.addEventListener("input", () => {
      const v = toFiniteNumber(num.value, NaN);
      if (!Number.isFinite(v)) return;

      const vc = isOverrideOn() ? v : clamp(v, min, max);
      if (!isOverrideOn() && !Object.is(vc, v)) num.value = String(vc);

      range.value = String(clamp(vc, min, max));
    });

    row.appendChild(name);
    row.appendChild(range);
    r.sliderRootEl.appendChild(row);
  }

  r.overrideModeEl?.addEventListener("change", () => {
    // When override is turned OFF: immediately clamp inputs into their ranges so slider/number stay consistent.
    if (!isOverrideOn()) {
      for (const num of nums) {
        const minAttr = num.getAttribute("min");
        const maxAttr = num.getAttribute("max");
        if (minAttr === null || maxAttr === null) continue;

        const min = Number(minAttr);
        const max = Number(maxAttr);

        const v = toFiniteNumber(num.value, NaN);
        if (Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(v)) {
          num.value = String(clamp(v, min, max));
          num.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    }
  });
}
