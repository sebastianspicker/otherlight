import { describe, expect, it } from "vitest";

import { buildBinaryLabParams } from "../../src/app/binaryLab";
import { createSimulationRuntimeV4FromParams } from "../../src/app/v4Runtime";

describe("app v4 runtime builder", () => {
  it("strips unsupported V4 scattering terms and surfaces a status message", () => {
    const system = buildBinaryLabParams();
    system.star.photometry = {
      ...system.star.photometry,
      forwardScattering: { enabled: true, amp: 0.03, kind: "hg-angle", g: 0.85 },
      ringScattering: { enabled: true, amp: 0.02, sigmaPhase: 0.2 },
    };

    const runtime = createSimulationRuntimeV4FromParams({
      system,
      binaryMode: false,
      runtimeMode: "realtime",
    });

    const cfg = runtime.getConfig();
    expect(cfg.photometry?.forwardScattering).toBeUndefined();
    expect(cfg.photometry?.ringScattering).toBeUndefined();
    expect(runtime.takeStatusMessage()).toContain(
      "Forward scattering and ring scattering are disabled in V4",
    );
    expect(runtime.takeStatusMessage()).toBeUndefined();
  });
});
