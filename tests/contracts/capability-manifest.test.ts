/** Verifies stable cross-platform capability IDs, status evidence, and unavailable-state reasons. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type PlatformStatus = {
  status: "available" | "experimental" | "unavailable";
  availability?: "capability-gated";
  evidence: string[];
  reason?: string;
};

type Capability = {
  id: string;
  area: string;
  title: string;
  website: PlatformStatus;
  macos: PlatformStatus;
  iphone: PlatformStatus;
  ipad: PlatformStatus;
};

const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), "contracts/capabilities-v1/manifest.json"), "utf8"),
) as { schemaVersion: string; capabilities: Capability[] };

const appleUnimplementedCapabilityIds = new Set([
  "education.runtime-reference",
  "education.binary-photometry",
  "education.atmosphere-photometry",
  "education.measurement-noise",
  "education.nbody-runtime",
  "education.relativity-runtime",
  "labs.binary-black-box",
]);

describe("cross-platform capability manifest", () => {
  it("uses stable unique IDs and existing evidence paths", () => {
    expect(manifest.schemaVersion).toBe("capabilities-v1");
    const ids = manifest.capabilities.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const capability of manifest.capabilities) {
      expect(capability.id).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
      expect(capability.title.length).toBeGreaterThan(0);
      for (const platform of [capability.website, capability.macos, capability.iphone, capability.ipad]) {
        if (platform.status === "available") expect(platform.evidence.length).toBeGreaterThan(0);
        if (platform.status !== "available") expect(platform.reason?.length).toBeGreaterThan(0);
        for (const evidence of platform.evidence) {
          expect(existsSync(path.join(process.cwd(), evidence)), `${capability.id}: ${evidence}`).toBe(true);
        }
      }
    }
  });

  it("retains experimental Apple delivery claims until dedicated simulator evidence exists", () => {
    for (const capability of manifest.capabilities) {
      for (const [name, platform] of Object.entries({
        iphone: capability.iphone,
        ipad: capability.ipad,
      })) {
        if (platform.status === "experimental") {
          expect(platform.reason, `${capability.id}:${name}`).toMatch(/Xcode 26\.6|simulator|device|gate/i);
        }
      }
    }
  });

  it("does not advertise Scientific execution on Apple without evidence", () => {
    for (const capability of manifest.capabilities.filter(({ area }) => area === "science")) {
      expect(capability.iphone.status, capability.id).toBe("unavailable");
      expect(capability.ipad.status, capability.id).toBe("unavailable");
    }
  });

  it("marks the known Apple-unimplemented capabilities unavailable without evidence", () => {
    const matchingCapabilities = manifest.capabilities.filter(({ id }) =>
      appleUnimplementedCapabilityIds.has(id),
    );
    expect(matchingCapabilities.map(({ id }) => id).sort()).toEqual(
      [...appleUnimplementedCapabilityIds].sort(),
    );
    for (const capability of matchingCapabilities) {
      for (const platform of [capability.iphone, capability.ipad]) {
        expect(platform.status, capability.id).toBe("unavailable");
        expect(platform.evidence, capability.id).toEqual([]);
        expect(platform.reason, capability.id).toMatch(/not implemented in the shared Apple application/i);
      }
    }
  });

  it("marks conditionally advertised Scientific browser capabilities as capability-gated", () => {
    for (const capability of manifest.capabilities.filter(
      ({ area, website }) => area === "science" && website.status === "available",
    )) {
      expect(capability.website.availability, capability.id).toBe("capability-gated");
    }
  });
});
