/** Verifies that programmatic form synchronization does not create an unapplied draft. */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBootstrapDirtyGuard } from "../../src/presentation/controllers/bootstrapDirtyGuard";

type DomGlobals = {
  window: typeof window;
  document: typeof document;
  HTMLInputElement: typeof HTMLInputElement;
  HTMLSelectElement: typeof HTMLSelectElement;
  AbortController: typeof AbortController;
  AbortSignal: typeof AbortSignal;
  Event: typeof Event;
};

let dom: JSDOM;
let previous: DomGlobals;

beforeEach(() => {
  dom = new JSDOM(`<!doctype html><body>
    <select id="uiMode"><option value="expert" selected>Advanced</option></select>
    <form id="params"><input id="starR" type="number" value="1" /></form>
    <span id="dirty" hidden></span>
    <dialog id="dialog"></dialog>
    <button id="keep" type="button"></button>
    <button id="discard" type="button"></button>
    <button id="apply" type="button"></button>
  </body>`);
  previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLSelectElement: globalThis.HTMLSelectElement,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    Event: globalThis.Event,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    AbortController: dom.window.AbortController,
    AbortSignal: dom.window.AbortSignal,
    Event: dom.window.Event,
  });
});

afterEach(() => {
  Object.assign(globalThis, previous);
  dom.window.close();
});

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function createGuard() {
  const dialog = element<HTMLDialogElement>("dialog");
  const showModal = vi.fn();
  const close = vi.fn();
  dialog.showModal = showModal;
  dialog.close = close;
  const controller = new AbortController();
  const guard = createBootstrapDirtyGuard({
    form: element<HTMLFormElement>("params"),
    uiModeSelect: element<HTMLSelectElement>("uiMode"),
    dirtyState: element("dirty"),
    dialog,
    keepEditingButton: element<HTMLButtonElement>("keep"),
    discardButton: element<HTMLButtonElement>("discard"),
    applyButton: element<HTMLButtonElement>("apply"),
    clearValidation: vi.fn(),
    signal: controller.signal,
  });
  return { guard, controller, showModal, close };
}

describe("bootstrap dirty guard", () => {
  it("ignores synthetic input dispatched while synchronizing scenario controls", () => {
    const { guard, controller, showModal } = createGuard();
    const action = vi.fn();

    element<HTMLInputElement>("starR").dispatchEvent(new Event("input", { bubbles: true }));
    guard.requestContextChange(action);

    expect(action).toHaveBeenCalledOnce();
    expect(showModal).not.toHaveBeenCalled();
    expect(element("dirty").hidden).toBe(true);
    controller.abort();
  });

  it("retains explicit dirty state until the user discards the pending context change", () => {
    const { guard, controller, showModal, close } = createGuard();
    const action = vi.fn();
    guard.setDirty(true);

    guard.requestContextChange(action);
    expect(showModal).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();

    element<HTMLButtonElement>("discard").click();
    expect(close).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
    expect(element("dirty").hidden).toBe(true);
    controller.abort();
  });
});
