import { renderHeaderTemplate } from "./templates/header";
import { renderParametersTemplate } from "./templates/parameters";
import { renderSidebarTemplate } from "./templates/sidebar";
import { renderVisualizationTemplate } from "./templates/visualization";

export function renderAppShell(root: HTMLElement | null = null): void {
  if (typeof document === "undefined") return;
  const host = root ?? ensureAppShellRoot();
  host.innerHTML = appShellInnerHtml();
}

export function createAppDocumentHtml(): string {
  return `
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="referrer" content="strict-origin-when-cross-origin" />
      <title>Transit-Exomoon-Simulator</title>
    </head>
    <body>
      ${appShellInnerHtml()}
    </body>
  `;
}

function appShellInnerHtml(): string {
  return `
    <a href="#main" class="skip-link">Skip to main content</a>
    <div id="app" class="app">
      ${renderHeaderTemplate()}
      <main id="main" class="app-main">
        <div class="mainGrid">
          <div class="mainLeft">
            ${renderVisualizationTemplate()}
            ${renderParametersTemplate()}
          </div>
          ${renderSidebarTemplate()}
        </div>
        <noscript><p class="help">JavaScript is required to run the simulation.</p></noscript>
      </main>
    </div>
  `;
}

function ensureAppShellRoot(): HTMLElement {
  let root = document.getElementById("appShellRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "appShellRoot";
    document.body.prepend(root);
  }
  return root;
}
