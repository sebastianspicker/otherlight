/**
 * Owns app Shell support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { renderHeaderTemplate } from "./templates/header";
import { renderCommandStrip } from "./templates/commandStrip";
import { renderSidebarTemplate } from "./templates/sidebar";
import { renderVisualizationTemplate } from "./templates/visualization";
import { renderReadouts } from "./templates/sidebarRuntime";
import { renderScientificWorkspace } from "./templates/scientificWorkspace";
import { runtimeAssetUrl } from "../runtime/deployment";

export { renderCommandStrip } from "./templates/commandStrip";
export {
  renderRuntimeControls,
  renderRuntimeToolbar,
  renderReadouts,
  renderPlotControls,
  renderOcSection,
} from "./templates/sidebarRuntime";
export { renderHeaderTemplate, renderWorkspaceActions, WORKSPACE_FILE_ACCEPT } from "./templates/header";
export { renderSidebarTemplate } from "./templates/sidebar";

export function renderAppShell(root: HTMLElement | null = null): void {
  if (typeof document === "undefined") return;
  const host = root ?? ensureAppShellRoot();
  replaceChildrenFromTrustedHtml(host, appShellInnerHtml());
}

export function createAppDocumentHtml(baseUrl = import.meta.env.BASE_URL): string {
  return `
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="referrer" content="strict-origin-when-cross-origin" />
      <title>Otherlight: Exoplanet learning &amp; scientific modeling</title>
      <link rel="icon" href="${runtimeAssetUrl("favicon.svg", baseUrl)}" type="image/svg+xml" />
    </head>
    <body>
      ${appShellInnerHtml(baseUrl)}
    </body>
  `;
}

function appShellInnerHtml(baseUrl = import.meta.env.BASE_URL): string {
  return `
    <a href="#main" class="skip-link">Skip to main content</a>
    <div id="app" class="app">
      ${renderHeaderTemplate(baseUrl)}
      ${renderCommandStrip()}
      <section id="fatalError" class="fatal-error" role="alert" tabindex="-1" hidden>
        <h2>Otherlight could not start</h2>
        <p id="fatalErrorMessage">The application failed during initialization.</p>
        <p>Your data is not stored by this application. Reload the page to retry from a known state.</p>
        <button id="fatalReloadBtn" type="button">Reload application</button>
      </section>
      <main id="main" class="app-main">
        <div data-product-profile="education">
          <div class="mainGrid">
            <div class="mainLeft">
              ${renderVisualizationTemplate()}
              ${renderReadouts()}
            </div>
            ${renderSidebarTemplate()}
          </div>
        </div>
        ${renderScientificWorkspace()}
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
