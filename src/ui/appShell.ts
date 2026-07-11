import { renderHeaderTemplate } from "./templates/header";
import { renderParametersTemplate } from "./templates/parameters";
import { renderSidebarTemplate } from "./templates/sidebar";
import { renderVisualizationTemplate } from "./templates/visualization";
import { renderRuntimeToolbar } from "./templates/sidebarRuntime";

export function renderAppShell(root: HTMLElement | null = null): void {
  if (typeof document === "undefined") return;
  const host = root ?? ensureAppShellRoot();
  replaceChildrenFromTrustedHtml(host, appShellInnerHtml());
}

export function createAppDocumentHtml(): string {
  return `
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="referrer" content="strict-origin-when-cross-origin" />
      <title>Transit Light-Curve Lab</title>
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
      <div id="appStatus" class="app-status" role="status" aria-live="polite" aria-atomic="true">
        <span id="appStatusMessage">Ready. Choose a scenario, then start the simulation or open a guided lab.</span>
        <button id="appRetryBtn" type="button" hidden>Retry last scenario</button>
      </div>
      <section id="fatalError" class="fatal-error" role="alert" tabindex="-1" hidden>
        <h2>Transit Light-Curve Lab could not start</h2>
        <p id="fatalErrorMessage">The application failed during initialization.</p>
        <p>Your data is not stored by this application. Reload the page to retry from a known state.</p>
        <button id="fatalReloadBtn" type="button">Reload application</button>
      </section>
      <main id="main" class="app-main">
        ${renderRuntimeToolbar()}
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

function replaceChildrenFromTrustedHtml(host: HTMLElement, html: string): void {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const nodes = Array.from(parsed.body.childNodes, (node) => document.importNode(node, true));
  host.replaceChildren(...nodes);
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
