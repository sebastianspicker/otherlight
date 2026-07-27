/** Verifies clone contracts in shared app and physics primitives. */

import { describe, expect, it } from "vitest";

import { deepClone } from "../../src/core/clone";

describe("deepClone", () => {
  it("clones a flat object", () => {
    const orig = { a: 1, b: "two", c: true };
    const copy = deepClone(orig);
    expect(copy).toEqual(orig);
    expect(copy).not.toBe(orig);
  });

  it("clones nested objects deeply", () => {
    const orig = { x: { y: { z: 42 } }, arr: [1, 2, 3] };
    const copy = deepClone(orig);
    expect(copy).toEqual(orig);
    expect(copy.x).not.toBe(orig.x);
    expect(copy.x.y).not.toBe(orig.x.y);
    expect(copy.arr).not.toBe(orig.arr);
  });

  it("produces independent copies (mutations do not propagate)", () => {
    const orig = { nested: { value: 10 }, list: [1, 2] };
    const copy = deepClone(orig);
    copy.nested.value = 999;
    copy.list.push(3);
    expect(orig.nested.value).toBe(10);
    expect(orig.list).toEqual([1, 2]);
  });

  it("handles null values", () => {
    const orig = { a: null, b: [null, 1] };
    const copy = deepClone(orig);
    expect(copy).toEqual(orig);
  });

  it("handles empty objects and arrays", () => {
    expect(deepClone({})).toEqual({});
    expect(deepClone([])).toEqual([]);
  });
});
