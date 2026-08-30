/** Verifies browser workspace filenames change without changing workspace-v1 parsing. */
import { describe, expect, it } from "vitest";

import { WORKSPACE_DOWNLOAD_FILENAME } from "../../src/presentation/controllers/bootstrapPersistence";
import { WORKSPACE_FILE_ACCEPT } from "../../src/presentation/ui/templates/header";

describe("Otherlight workspace files", () => {
  it("exports the new Otherlight extension", () => {
    expect(WORKSPACE_DOWNLOAD_FILENAME).toBe("otherlight-workspace.otherlight");
  });

  it("continues to offer legacy Transit Lab and JSON imports", () => {
    expect(WORKSPACE_FILE_ACCEPT.split(",")).toEqual([".otherlight", ".transitlab", "application/json"]);
  });
});
