/** Verifies accessible workspace document controls remain distinct from result exports. */
import { describe, expect, it } from "vitest";
import { renderCommandStrip } from "../../src/ui/templates/commandStrip";
import { renderWorkspaceActions, WORKSPACE_FILE_ACCEPT } from "../../src/ui/templates/header";

describe("workspace document controls", () => {
  it("keeps dedicated accessible workspace controls separate from data exports", () => {
    const actions = renderWorkspaceActions();
    expect(actions).toContain('id="workspaceOpenBtn"');
    expect(actions).toContain('id="workspaceSaveBtn"');
    expect(actions).toContain('id="workspaceFileInput"');
    expect(actions).toContain(`accept="${WORKSPACE_FILE_ACCEPT}"`);
    expect(actions).toContain(".otherlight");
    expect(actions).toContain(".transitlab");
    expect(actions).not.toContain("Export CSV");
  });

  it("places Open/Save in the command strip, not the identity header", () => {
    const strip = renderCommandStrip();
    expect(strip).toContain('id="workspaceOpenBtn"');
    expect(strip).toContain('id="workspaceSaveBtn"');
    expect(strip).toContain("command-strip");
  });
});
