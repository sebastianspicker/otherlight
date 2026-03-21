import { describe, expect, it } from "vitest";

import {
  projectToSky,
  buildSkyBasis,
  rotateZ,
  rotateX,
  rotateY,
  perifocalToInertial,
} from "../../src/physics/frames";
import { vDot, vLen, vCross } from "../../src/physics/vec3";
import type { Vec3 } from "../../src/physics/vec3";

describe("projectToSky", () => {
  it("preserves z (depth) for the default observer along +Z", () => {
    // For observer along +Z, the sky basis is: ex={0,-1,0}, ey={1,0,0}, ez={0,0,1}.
    // So sky.x = dot(r,ex) = -r.y, sky.y = dot(r,ey) = r.x, sky.z = dot(r,ez) = r.z.
    const r: Vec3 = { x: 3.5, y: -2, z: 7 };
    const sky = projectToSky(r, { x: 0, y: 0, z: 1 });
    expect(sky.x).toBeCloseTo(2, 10);   // -(-2) = 2
    expect(sky.y).toBeCloseTo(3.5, 10); // 3.5
    expect(sky.z).toBeCloseTo(7, 10);   // depth preserved
  });

  it("produces positive z (depth) when a body is in front of the observer", () => {
    // Observer looks along +Z; body at z=5 should have positive depth.
    const sky = projectToSky({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 1 });
    expect(sky.z).toBeGreaterThan(0);
  });

  it("produces negative z (depth) when a body is behind the observer", () => {
    const sky = projectToSky({ x: 0, y: 0, z: -5 }, { x: 0, y: 0, z: 1 });
    expect(sky.z).toBeLessThan(0);
  });

  it("works with observer along +X", () => {
    // Observer looks along +X: an object at (10,0,0) should have positive depth.
    const sky = projectToSky({ x: 10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(sky.z).toBeCloseTo(10, 10);
  });

  it("works with an arbitrary observer direction", () => {
    const dir: Vec3 = { x: 1, y: 2, z: 3 };
    const r: Vec3 = { x: 5, y: -1, z: 2 };
    const sky = projectToSky(r, dir);

    // The projected sky distance squared plus depth squared should equal |r|^2.
    const rMag2 = r.x * r.x + r.y * r.y + r.z * r.z;
    const skyMag2 = sky.x * sky.x + sky.y * sky.y + sky.z * sky.z;
    expect(skyMag2).toBeCloseTo(rMag2, 8);
  });
});

describe("buildSkyBasis", () => {
  it("produces an orthonormal, right-handed basis", () => {
    const { ex, ey, ez } = buildSkyBasis({ x: 1, y: 2, z: 3 });

    // Orthogonality
    expect(Math.abs(vDot(ex, ey))).toBeLessThan(1e-10);
    expect(Math.abs(vDot(ex, ez))).toBeLessThan(1e-10);
    expect(Math.abs(vDot(ey, ez))).toBeLessThan(1e-10);

    // Unit length
    expect(vLen(ex)).toBeCloseTo(1, 10);
    expect(vLen(ey)).toBeCloseTo(1, 10);
    expect(vLen(ez)).toBeCloseTo(1, 10);

    // Right-handed: ex x ey ~ ez
    const rhs = vCross(ex, ey);
    expect(vDot(rhs, ez)).toBeGreaterThan(0.9999);
  });

  it("handles observer along each axis without degeneracy", () => {
    for (const dir of [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    ] as Vec3[]) {
      const { ex, ey, ez } = buildSkyBasis(dir);
      expect(vLen(ex)).toBeCloseTo(1, 10);
      expect(vLen(ey)).toBeCloseTo(1, 10);
      expect(vLen(ez)).toBeCloseTo(1, 10);
    }
  });

  it("throws for zero vector", () => {
    expect(() => buildSkyBasis({ x: 0, y: 0, z: 0 })).toThrow();
  });

  it("throws for non-finite vector", () => {
    expect(() => buildSkyBasis({ x: NaN, y: 0, z: 0 })).toThrow();
  });
});

describe("rotateZ", () => {
  it("rotates X-axis toward Y-axis by 90 degrees", () => {
    const result = rotateZ({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
    expect(result.z).toBeCloseTo(0, 10);
  });

  it("leaves z component unchanged", () => {
    const result = rotateZ({ x: 0, y: 0, z: 7 }, 1.23);
    expect(result.z).toBeCloseTo(7, 10);
  });
});

describe("rotateX", () => {
  it("rotates Y-axis toward Z-axis by 90 degrees", () => {
    const result = rotateX({ x: 0, y: 1, z: 0 }, Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.z).toBeCloseTo(1, 10);
  });
});

describe("rotateY", () => {
  it("rotates Z-axis toward X-axis by 90 degrees", () => {
    const result = rotateY({ x: 0, y: 0, z: 1 }, Math.PI / 2);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
    expect(result.z).toBeCloseTo(0, 10);
  });
});

describe("perifocalToInertial", () => {
  it("is identity when all angles are zero", () => {
    const r: Vec3 = { x: 3, y: 4, z: 0 };
    const result = perifocalToInertial(r, 0, 0, 0);
    expect(result.x).toBeCloseTo(r.x, 10);
    expect(result.y).toBeCloseTo(r.y, 10);
    expect(result.z).toBeCloseTo(r.z, 10);
  });

  it("preserves vector length (rotation is isometric)", () => {
    const r: Vec3 = { x: 1, y: 2, z: 0 };
    const result = perifocalToInertial(r, 0.5, 1.2, 0.3);
    expect(vLen(result)).toBeCloseTo(vLen(r), 10);
  });
});
