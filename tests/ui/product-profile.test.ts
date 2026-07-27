// @vitest-environment jsdom
/** Verifies product profile controls and views for accessible, consistent interaction. */

import { describe, expect, it } from "vitest";

import {
  readProductProfile,
  syncProductProfileNavigation,
  syncProductProfileVisibility,
} from "../../src/ui/productProfile";

describe("product profile", () => {
  it("defaults unknown values to education", () => {
    expect(readProductProfile(undefined)).toBe("education");
    expect(readProductProfile("preview")).toBe("education");
    expect(readProductProfile("scientific")).toBe("scientific");
  });

  it("switches profile surfaces and navigation without conflating workspace mode", () => {
    document.body.innerHTML = `
      <select id="profile"><option value="education">Education</option><option value="scientific">Scientific</option></select>
      <button id="education"></button><button id="scientific"></button>
      <section id="educationSurface" data-product-profile="education"></section>
      <section id="scienceSurface" data-product-profile="scientific"></section>
    `;
    const select = document.getElementById("profile") as HTMLSelectElement;
    const education = document.getElementById("education") as HTMLButtonElement;
    const scientific = document.getElementById("scientific") as HTMLButtonElement;

    select.value = "scientific";
    syncProductProfileVisibility("scientific");
    syncProductProfileNavigation(select, education, scientific);

    expect(document.documentElement.dataset.productProfile).toBe("scientific");
    expect(document.getElementById("educationSurface")?.hidden).toBe(true);
    expect(document.getElementById("scienceSurface")?.hidden).toBe(false);
    expect(education.getAttribute("aria-current")).toBe("false");
    expect(scientific.getAttribute("aria-current")).toBe("page");
  });
});
