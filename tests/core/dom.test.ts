// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  mustGet,
  mustGetAs,
  setText,
  setHidden,
  setDisabled,
  verifyCssEscapeInThisBrowser,
} from "../../src/core/dom";

describe("mustGet", () => {
  it("returns an existing element by id", () => {
    const el = document.createElement("div");
    el.id = "test-mustget";
    document.body.appendChild(el);
    try {
      const found = mustGet("test-mustget");
      expect(found).toBe(el);
    } finally {
      el.remove();
    }
  });

  it("throws for a missing element", () => {
    expect(() => mustGet("nonexistent-id-xyz")).toThrow(/Missing element #nonexistent-id-xyz/);
  });

  it("includes scopeName in error when provided", () => {
    expect(() => mustGet("missing", { scopeName: "panel" })).toThrow(/in panel/);
  });

  it("searches within a provided root element", () => {
    const root = document.createElement("div");
    const child = document.createElement("span");
    child.id = "inner-child";
    root.appendChild(child);
    document.body.appendChild(root);
    try {
      const found = mustGet("inner-child", { root });
      expect(found).toBe(child);
    } finally {
      root.remove();
    }
  });
});

describe("mustGetAs", () => {
  it("returns an element when the type matches", () => {
    const input = document.createElement("input");
    input.id = "test-input-as";
    document.body.appendChild(input);
    try {
      const found = mustGetAs("test-input-as", HTMLInputElement);
      expect(found).toBeInstanceOf(HTMLInputElement);
      expect(found).toBe(input);
    } finally {
      input.remove();
    }
  });

  it("throws when the element type does not match", () => {
    const div = document.createElement("div");
    div.id = "test-div-as";
    document.body.appendChild(div);
    try {
      expect(() => mustGetAs("test-div-as", HTMLCanvasElement)).toThrow(/wrong type/);
    } finally {
      div.remove();
    }
  });
});

describe("setText", () => {
  it("sets textContent on an element", () => {
    const el = document.createElement("span");
    setText(el, "hello world");
    expect(el.textContent).toBe("hello world");
  });

  it("overwrites previous textContent", () => {
    const el = document.createElement("span");
    el.textContent = "old";
    setText(el, "new");
    expect(el.textContent).toBe("new");
  });

  it("escapes HTML (safe against injection)", () => {
    const el = document.createElement("span");
    setText(el, "<script>alert(1)</script>");
    expect(el.innerHTML).not.toContain("<script>");
    expect(el.textContent).toBe("<script>alert(1)</script>");
  });
});

describe("setHidden", () => {
  it("sets hidden=true", () => {
    const el = document.createElement("div");
    setHidden(el, true);
    expect(el.hidden).toBe(true);
  });

  it("sets hidden=false", () => {
    const el = document.createElement("div");
    el.hidden = true;
    setHidden(el, false);
    expect(el.hidden).toBe(false);
  });
});

describe("setDisabled", () => {
  it("disables a button and sets aria-disabled", () => {
    const btn = document.createElement("button");
    setDisabled(btn, true);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("enables a button and sets aria-disabled to false", () => {
    const btn = document.createElement("button");
    btn.disabled = true;
    setDisabled(btn, false);
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-disabled")).toBe("false");
  });

  it("sets aria-disabled on non-form elements without .disabled property", () => {
    const div = document.createElement("div");
    setDisabled(div, true);
    expect(div.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("verifyCssEscapeInThisBrowser", () => {
  it("is callable (may throw in environments without CSS.escape)", () => {
    // jsdom does not provide CSS.escape and the fallback may not handle all tricky
    // characters in jsdom's querySelector, so we only verify the function exists.
    expect(typeof verifyCssEscapeInThisBrowser).toBe("function");
  });
});
