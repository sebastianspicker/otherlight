/** Configures production bundling and CSP headers, including the explicit loopback V5 boundary. */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, type HtmlTagDescriptor } from "vite";

type AppCspMode = "serve" | "build";

const SCIENCE_LOOPBACK_SOURCES = "http://127.0.0.1:8765 http://localhost:8765";

const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
const browserRoot = fileURLToPath(new URL(".", import.meta.url));

function appCspDirectives(mode: AppCspMode): string[] {
  if (mode === "serve") {
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: blob:",
      `connect-src 'self' ${SCIENCE_LOOPBACK_SOURCES} ws: wss:`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${SCIENCE_LOOPBACK_SOURCES}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
}

export function appCspForMode(mode: AppCspMode): string {
  return [...appCspDirectives(mode), "frame-ancestors 'none'"].join("; ");
}

export function appCspMetaForMode(mode: AppCspMode): string {
  // `frame-ancestors` is ignored in CSP meta elements, so only advertise it
  // through the real response header below.
  return appCspDirectives(mode).join("; ");
}

export function appSecurityHeadersForMode(mode: AppCspMode): Record<string, string> {
  return {
    ...BASE_SECURITY_HEADERS,
    "Content-Security-Policy": appCspForMode(mode),
  };
}

function appCspMetaTag(mode: AppCspMode): HtmlTagDescriptor {
  return {
    tag: "meta",
    attrs: {
      "http-equiv": "Content-Security-Policy",
      content: appCspMetaForMode(mode),
    },
    injectTo: "head",
  };
}

export default defineConfig(({ command }) => {
  const cspMode: AppCspMode = command === "serve" ? "serve" : "build";

  return {
    root: browserRoot,
    plugins: [
      {
        name: "app-csp-meta",
        transformIndexHtml() {
          return [appCspMetaTag(cspMode)];
        },
      },
    ],
    build: {
      outDir: resolve(browserRoot, "../../dist"),
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      headers: appSecurityHeadersForMode("serve"),
    },
    preview: {
      headers: appSecurityHeadersForMode("build"),
    },
  };
});
