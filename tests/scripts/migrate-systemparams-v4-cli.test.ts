/** Verifies migrate systemparams v4 CLI behavior for reproducible data and migration workflows. */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { SystemParams } from "../../src/core/types";
import { migrateSystemParamsToV4 } from "../../src/sim/v4/migrate";

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function runCliOnJson(input: unknown): unknown {
  const stdout = execFileSync(process.execPath, ["scripts/migrate-systemparams-v4.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${JSON.stringify(input, null, 2)}\n`,
  });
  return JSON.parse(stdout) as unknown;
}

const MAX_STDIN_BYTES = 10 * 1024 * 1024;

function jsonAtByteLength(bytes: number): string {
  const prefix = '{"padding":"';
  const suffix = '"}';
  return `${prefix}${"x".repeat(bytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}`;
}

function resolvePath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    return value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)[segment]
      : undefined;
  }, root);
}

describe("migrate-systemparams-v4 CLI", () => {
  it("runs with the published stdin/stdout Node invocation", () => {
    const stdout = execFileSync(process.execPath, ["scripts/migrate-systemparams-v4.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: JSON.stringify({
        meta: { version: 2, schema: "SystemParams/v2" },
        defaults: {
          star: { r: 6.957e8, m: 1.98847e30 },
          planet: { orbit: { a: 7.4e9, e: 0.05, inc: 1.5, Omega: 0.1, omega: 0.2, period: 3e5, t0: 0 } },
          observer: { dir: { x: 0, y: 0, z: 1 } },
        },
      }),
    });

    const parsed = JSON.parse(stdout) as {
      meta?: { version?: number; schema?: string };
      defaults?: { version?: string; bodies?: { stars?: Array<{ id?: string; m?: number }> } };
    };
    expect(parsed.meta?.version).toBe(4);
    expect(parsed.meta?.schema).toBe("SystemParamsV4+Controls/v4");
    expect(parsed.defaults?.version).toBe("4");
    expect(parsed.defaults?.bodies?.stars?.find((star) => star.id === "star-b")?.m).toBe(0);
  });

  it("matches runtime migration for orbit fallback and binary-star photometry", () => {
    const src: SystemParams = {
      observer: { dir: { x: 0, y: 0, z: 1 } },
      star: {
        r: 6.957e8,
        m: 1.98847e30,
        photometry: {
          baselineFlux: 1,
          limbDarkeningModel: {
            bandpass: "r",
            stellar: { teffK: 6100, loggCgs: 4.2, metallicityDex: -0.1 },
          },
        },
      },
      binaryStars: {
        primary: { luminosityScale: 1.2, passband: "g" },
        secondary: { luminosityScale: 0.35, teffK: 5200, loggCgs: 4.5 },
      },
      planet: {
        r: 6.9911e7,
        m: 1.89813e27,
        orbit: { a: -7.4e9, e: 1.2, inc: 1.5, Omega: 0.1, omega: 0.2, period: -3e5, t0: 0 },
      },
      moon: {
        r: 6.371e6,
        m: 5.9722e24,
        orbitAroundPlanet: { a: 2e8, e: -0.01, inc: 0.1, Omega: 0.2, omega: 0.3, period: 5e4, t0: 0 },
      },
    };

    expect(runCliOnJson(src)).toEqual(jsonRoundTrip(migrateSystemParamsToV4(src)));
  });

  it("matches runtime migration inside scenario envelopes", () => {
    const defaults: SystemParams = {
      observer: { dir: { x: 1, y: 0, z: 1 } },
      star: { r: 6.957e8, m: 1.98847e30, photometry: { baselineFlux: 1 } },
      planet: {
        r: 6.9911e7,
        m: 1.89813e27,
        orbit: { a: 7.4e9, e: 0.05, inc: 1.5, Omega: 0.1, omega: 0.2, period: 3e5, t0: 0 },
      },
    };
    const scenario = {
      meta: { version: 2, schema: "SystemParams/v2", name: "parity fixture" },
      defaults,
    };

    expect(runCliOnJson(scenario)).toEqual(
      jsonRoundTrip({
        ...scenario,
        meta: { ...scenario.meta, version: 4, schema: "SystemParamsV4+Controls/v4" },
        defaults: migrateSystemParamsToV4(defaults),
      }),
    );
  });

  it("rewrites legacy UI control paths to the V4 defaults they label", () => {
    const scenario = JSON.parse(readFileSync("src/config/scenario.default.json", "utf8")) as unknown;

    const migrated = runCliOnJson(scenario) as {
      meta?: { schema?: string };
      defaults: unknown;
      ui?: { controls?: Array<{ path?: string }> };
    };

    expect(migrated.meta?.schema).toBe("SystemParamsV4+Controls/v4");
    const paths = migrated.ui?.controls?.map((control) => control.path) ?? [];
    expect(paths).toContain("bodies.stars.0.r");
    expect(paths).toContain("photometry.baselineFlux");
    expect(paths).toContain("bodies.planets.0.orbit.period");
    expect(paths).toContain("bodies.moons.0.orbit.a");
    for (const path of paths) {
      expect(typeof path).toBe("string");
      expect(resolvePath(migrated.defaults, path as string)).not.toBeUndefined();
    }
  });

  it("rejects path arguments so user input cannot drive filesystem access", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/migrate-systemparams-v4.mjs", "src/config/scenario.default.json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Usage: node scripts/migrate-systemparams-v4.mjs < input.json > output.json",
    );
  });

  it("accepts stdin exactly at the documented byte ceiling", () => {
    const result = spawnSync(process.execPath, ["scripts/migrate-systemparams-v4.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: jsonAtByteLength(MAX_STDIN_BYTES),
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ version: "4" });
  });

  it("rejects stdin over the byte ceiling before JSON parsing", () => {
    const result = spawnSync(process.execPath, ["scripts/migrate-systemparams-v4.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: `${jsonAtByteLength(MAX_STDIN_BYTES)}x`,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Input exceeds ${MAX_STDIN_BYTES} bytes.`);
    expect(result.stderr).not.toContain("Unexpected token");
  });
});
