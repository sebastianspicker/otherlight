/** Verifies the native Swift documentation policy and its repository-wide enforcement. */

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runDocumentationCheck(source: string, path = "Fixture.swift") {
  return spawnSync(process.execPath, ["scripts/check-swift-documentation.mjs", "--stdin", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: source,
  });
}

describe("Swift declaration documentation gate", () => {
  it("reports undocumented declarations with stable source locations", () => {
    const result = runDocumentationCheck("struct Orbit {\n  func advance() {}\n}\n");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Fixture.swift:1: undocumented struct");
    expect(result.stderr).toContain("Fixture.swift:2: undocumented func");
  });

  it("accepts line and block documentation across declaration attributes", () => {
    const result = runDocumentationCheck(`
/// Owns the observable simulation state used by the workspace.
@MainActor @Observable
final class Session {
  /** Advances the model by one accepted frame so plots and diagnostics agree. */
  func advance() {}

  /// Returns the shared session used by command handlers.
  class func shared() -> Session { Session() }
}
`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Swift documentation check passed (1 source files).");
  });

  it("recognizes class methods and declarations with multiline-string defaults", () => {
    const classMethod = runDocumentationCheck(`
/// Owns the shared command session.
class Session {
  class func shared() -> Session { Session() }
}
`);
    const multilineDefault = runDocumentationCheck(`
/// Renders templates into display text.
struct Renderer {
  func render(template: String = """
    value
    """) {}
}
`);

    expect(classMethod.status).toBe(1);
    expect(classMethod.stderr).toContain("Fixture.swift:4: undocumented func");
    expect(multilineDefault.status).toBe(1);
    expect(multilineDefault.stderr).toContain("Fixture.swift:4: undocumented func");
  });

  it("accepts documented declarations with multiline-string defaults", () => {
    const result = runDocumentationCheck(`
/// Renders templates into display text.
struct Renderer {
  /// Renders a supplied template.
  func render(template: String = """
    value
    """) {}
}
`);

    expect(result.status).toBe(0);
  });

  it("does not mistake stored closures or implementation comments for declarations", () => {
    const result = runDocumentationCheck(`
/// Runs a supplied callback without claiming ownership of it.
struct CallbackRunner {
  let callback: () -> Void
  // This implementation note is not an API declaration.
  let label = "func example()"
}
`);

    expect(result.status).toBe(0);
  });

  it("passes against every native Swift source in the working tree", () => {
    const result = spawnSync(process.execPath, ["scripts/check-swift-documentation.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Swift documentation check passed \(\d+ source files\)\./);
  });
});
