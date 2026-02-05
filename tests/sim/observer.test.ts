import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { getObserverDir } from "../../src/sim/observer";

describe("getObserverDir", () => {
  it("defaults to +z when observer.dir is missing", () => {
    const params: SystemParams = {
      star: { r: 1 },
      planet: {
        r: 0.1,
        orbit: { a: 1, e: 0, inc: 0.1, Omega: 0, omega: 0, period: 10, t0: 0 },
      },
    };

    const dir = getObserverDir(params);
    expect(dir).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("throws on a zero observer direction vector", () => {
    const params: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 0 } },
      star: { r: 1 },
      planet: {
        r: 0.1,
        orbit: { a: 1, e: 0, inc: 0.1, Omega: 0, omega: 0, period: 10, t0: 0 },
      },
    };

    expect(() => getObserverDir(params)).toThrow("observer.dir must be non-zero.");
  });
});
