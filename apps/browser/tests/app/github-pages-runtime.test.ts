/** Covers base-aware presentation assets and the GitHub Pages scientific-runtime boundary. */
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wireScienceWorkspace } from "../../src/presentation/controllers/scienceWorkspace";
import { isGitHubPagesMode, runtimeAssetUrl } from "../../src/presentation/runtime/deployment";
import { createAppDocumentHtml } from "../../src/presentation/ui/appShell";
import { renderSidebarTemplate } from "../../src/presentation/ui/templates/sidebar";
import { renderScientificWorkspace } from "../../src/presentation/ui/templates/scientificWorkspace";

type DomGlobals = {
  window: typeof window;
  document: typeof document;
  HTMLElement: typeof HTMLElement;
  HTMLInputElement: typeof HTMLInputElement;
  HTMLButtonElement: typeof HTMLButtonElement;
  HTMLAnchorElement: typeof HTMLAnchorElement;
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
  DOMException: typeof DOMException;
  Event: typeof Event;
};

let restoreDomGlobals: (() => void) | undefined;

afterEach(() => restoreDomGlobals?.());

function installScientificWorkspaceDom(): void {
  const dom = new JSDOM(`<!doctype html><body>${renderScientificWorkspace()}</body>`);
  const previous: DomGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLButtonElement: globalThis.HTMLButtonElement,
    HTMLAnchorElement: globalThis.HTMLAnchorElement,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    DOMException: globalThis.DOMException,
    Event: globalThis.Event,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLAnchorElement: dom.window.HTMLAnchorElement,
    AbortController: dom.window.AbortController,
    AbortSignal: dom.window.AbortSignal,
    DOMException: dom.window.DOMException,
    Event: dom.window.Event,
  });
  restoreDomGlobals = () => {
    Object.assign(globalThis, previous);
    dom.window.close();
    restoreDomGlobals = undefined;
  };
}

function scienceWorkspaceArgs() {
  return {
    getSystem: () => ({}) as never,
    isBinaryMode: () => false,
    signal: new AbortController().signal,
  };
}

describe("GitHub Pages runtime presentation", () => {
  it("uses the runtime base URL for the generated favicon and brand asset", () => {
    expect(runtimeAssetUrl("favicon.svg", "/")).toBe("/favicon.svg");
    expect(runtimeAssetUrl("/brand/otherlight-signal-eclipse.svg", "/otherlight/")).toBe(
      "/otherlight/brand/otherlight-signal-eclipse.svg",
    );
    expect(isGitHubPagesMode("github-pages")).toBe(true);
    expect(isGitHubPagesMode("production")).toBe(false);

    const localDocument = createAppDocumentHtml("/");
    expect(localDocument).toContain('href="/favicon.svg"');
    expect(localDocument).toContain('src="/brand/otherlight-signal-eclipse.svg"');

    const pagesDocument = createAppDocumentHtml("/otherlight/");
    expect(pagesDocument).toContain('href="/otherlight/favicon.svg"');
    expect(pagesDocument).toContain('src="/otherlight/brand/otherlight-signal-eclipse.svg"');
    expect(renderScientificWorkspace()).toContain(
      'href="https://github.com/sebastianspicker/otherlight/blob/main/docs/physics/model-status.md"',
    );
    expect(renderSidebarTemplate()).toContain(
      'href="https://github.com/sebastianspicker/otherlight/blob/main/docs/physics/model-status.md"',
    );
  });

  it("keeps authoring controls available while blocking all scientific network actions on GitHub Pages", async () => {
    installScientificWorkspaceDom();
    const client = {
      getCapabilities: vi.fn(),
      submitJob: vi.fn(),
      pollJob: vi.fn(),
      getResult: vi.fn(),
      cancelJob: vi.fn(),
    };
    const createClient = vi.fn(() => client);
    const controller = wireScienceWorkspace({
      ...scienceWorkspaceArgs(),
      createClient,
      isGitHubPages: true,
    });

    await controller.refreshCapabilities();
    await controller.cancelCurrentJob();

    expect(createClient).not.toHaveBeenCalled();
    expect(client.getCapabilities).not.toHaveBeenCalled();
    expect(client.submitJob).not.toHaveBeenCalled();
    expect(client.pollJob).not.toHaveBeenCalled();
    expect(client.getResult).not.toHaveBeenCalled();
    expect(client.cancelJob).not.toHaveBeenCalled();
    expect(document.getElementById("scienceCapabilityStatus")?.textContent).toBe(
      "Unavailable on GitHub Pages",
    );
    expect(document.getElementById("scienceRunStatus")?.textContent).toContain("pnpm science:backend:serve");
    expect((document.getElementById("scienceRefreshBtn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("scienceCancelBtn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("scienceArtifactLink") as HTMLAnchorElement).hidden).toBe(true);
    expect((document.getElementById("scienceDurationHours") as HTMLInputElement).disabled).toBe(false);
  });

  it("continues to check the injected loopback client outside GitHub Pages", async () => {
    installScientificWorkspaceDom();
    const client = {
      getCapabilities: vi.fn(async () => ({
        serviceVersion: "5.0.0",
        supportedJobKinds: ["forward"],
        supportedOutputs: ["radial-velocity"],
      })),
      submitJob: vi.fn(),
      pollJob: vi.fn(),
      getResult: vi.fn(),
      cancelJob: vi.fn(),
    };
    const controller = wireScienceWorkspace({
      ...scienceWorkspaceArgs(),
      client,
      isGitHubPages: false,
    });

    await controller.refreshCapabilities();

    expect(client.getCapabilities).toHaveBeenCalledOnce();
    expect(document.getElementById("scienceCapabilityStatus")?.textContent).toBe("Available (5.0.0)");
    expect((document.getElementById("scienceRunBtn") as HTMLButtonElement).disabled).toBe(false);
  });
});
