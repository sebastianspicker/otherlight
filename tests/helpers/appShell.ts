/** Provides app-shell test utilities that preserve the DOM contracts used by app and UI tests. */

import { createAppDocumentHtml } from "../../src/ui/appShell";

export function installAppShellDocument(): void {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(createAppDocumentHtml(), "text/html");
  replaceDocumentChildren(document.head, parsed.head.childNodes);
  replaceDocumentChildren(document.body, parsed.body.childNodes);
}

function replaceDocumentChildren(target: HTMLElement, sourceNodes: NodeListOf<ChildNode>): void {
  const nodes = Array.from(sourceNodes, (node) => document.importNode(node, true));
  target.replaceChildren(...nodes);
}
