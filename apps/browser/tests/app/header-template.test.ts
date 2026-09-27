/** Verifies that the masthead describes evidence kinds without claiming an execution result. */
import { describe, expect, it } from "vitest";

import { renderHeaderTemplate } from "../../src/presentation/shell/templates/header";

describe("masthead evidence labels", () => {
  it("keeps the Scientific running head accurate before execution and on hosted replay", () => {
    const header = renderHeaderTemplate();

    expect(header).toContain(
      "a strict V5 boundary for loopback execution or a labelled hosted fixture replay",
    );
    expect(header).not.toContain("a validated V5 contract on your loopback service");
  });
});
