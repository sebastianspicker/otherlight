// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import {
  MAX_NUMBER_LIST_ENTRIES,
  MAX_QUADRATIC_BAND_ENTRIES,
  parseNumberList,
  parseQuadraticBands,
} from "../../src/ui/params/common";
import { installAppShellDocument } from "../helpers/appShell";

describe("photometry UI input bounds", () => {
  it("caps parsed numeric lists from free-form text input", () => {
    const text = Array.from({ length: MAX_NUMBER_LIST_ENTRIES + 40 }, (_, i) => String(i + 1)).join(",");

    const out = parseNumberList(text);

    expect(out).toHaveLength(MAX_NUMBER_LIST_ENTRIES);
    expect(out[0]).toBe(1);
    expect(out[out.length - 1]).toBe(MAX_NUMBER_LIST_ENTRIES);
  });

  it("caps parsed quadratic band definitions from free-form text input", () => {
    const text = Array.from(
      { length: MAX_QUADRATIC_BAND_ENTRIES + 12 },
      (_, i) => `band${i}:${0.1 + i * 0.001},${0.2 + i * 0.001}`,
    ).join(";");

    const out = parseQuadraticBands(text);

    expect(out).toBeDefined();
    expect(Object.keys(out ?? {})).toHaveLength(MAX_QUADRATIC_BAND_ENTRIES);
    expect(out?.band0).toEqual({ kind: "quadratic", u1: 0.1, u2: 0.2 });
  });

  it("caps atmosphere spectral arrays when reading photometry from the browser form", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { readPhotometryFromUI } = await import("../../src/ui/params/photometry");

    uiRefs.atmEnabled.checked = true;
    uiRefs.atmLambdaNm.value = Array.from({ length: MAX_NUMBER_LIST_ENTRIES + 25 }, (_, i) =>
      String(500 + i),
    ).join(",");
    uiRefs.atmTauScale.value = Array.from({ length: MAX_NUMBER_LIST_ENTRIES + 25 }, (_, i) =>
      String(1 + i / 100),
    ).join(",");

    const next: SystemParams = {
      star: { r: 1, photometry: {} },
      planet: {
        r: 1,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    };

    readPhotometryFromUI(next, uiRefs);

    expect(next.star.photometry?.atmosphereTransmission?.lambdaNm).toHaveLength(MAX_NUMBER_LIST_ENTRIES);
    expect(next.star.photometry?.atmosphereTransmission?.tauScale).toHaveLength(MAX_NUMBER_LIST_ENTRIES);
  });

  it("normalizes malformed atmosphere spectral inputs to aligned arrays", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { readPhotometryFromUI } = await import("../../src/ui/params/photometry");

    uiRefs.atmEnabled.checked = true;
    uiRefs.atmLambdaNm.value = "500, -1, 700";
    uiRefs.atmTauScale.value = "0.2, 0.4, 0.6";

    const next: SystemParams = {
      star: { r: 1, photometry: {} },
      planet: {
        r: 1,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    };

    readPhotometryFromUI(next, uiRefs);

    expect(next.star.photometry?.atmosphereTransmission?.lambdaNm).toEqual([500, 700]);
    expect(next.star.photometry?.atmosphereTransmission?.tauScale).toEqual([0.2, 0.6]);
  });

  it("uses star-scaled default patch inputs when no explicit brightness patches exist", async () => {
    installAppShellDocument();

    const { uiRefs } = await import("../../src/ui/refs");
    const { loadPhotometryIntoUI } = await import("../../src/ui/params/photometry");

    const starRadius = 6.957e8;
    const next: SystemParams = {
      star: { r: starRadius, photometry: {} },
      planet: {
        r: 1,
        orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
      },
    };

    loadPhotometryIntoUI(next, uiRefs);

    expect(Number(uiRefs.p1x.value)).toBe(-195000000);
    expect(Number(uiRefs.p1y.value)).toBe(153000000);
    expect(Number(uiRefs.p1r.value)).toBe(111000000);
    expect(Number(uiRefs.p2x.value)).toBe(230000000);
    expect(Number(uiRefs.p2y.value)).toBe(-118000000);
    expect(Number(uiRefs.p2rx.value)).toBe(146000000);
    expect(Number(uiRefs.p2ry.value)).toBe(63000000);
  });
});
