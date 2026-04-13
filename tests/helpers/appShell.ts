import { createAppDocumentHtml } from "../../src/ui/appShell";

export function installAppShellDocument(): void {
  document.documentElement.innerHTML = createAppDocumentHtml();
}

export function readAppShellDocument(): string {
  return createAppDocumentHtml();
}
