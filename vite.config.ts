import { defineConfig, type HtmlTagDescriptor } from "vite";

type AppCspMode = "serve" | "build";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export function appCspForMode(mode: AppCspMode): string {
  if (mode === "serve") {
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: blob:",
      "connect-src 'self' ws: wss:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function appCspMetaTag(mode: AppCspMode): HtmlTagDescriptor {
  return {
    tag: "meta",
    attrs: {
      "http-equiv": "Content-Security-Policy",
      content: appCspForMode(mode),
    },
    injectTo: "head",
  };
}

export default defineConfig(({ command }) => {
  const cspMode: AppCspMode = command === "serve" ? "serve" : "build";

  return {
    root: ".",
    plugins: [
      {
        name: "app-csp-meta",
        transformIndexHtml() {
          return [appCspMetaTag(cspMode)];
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      headers: SECURITY_HEADERS,
    },
    preview: {
      headers: SECURITY_HEADERS,
    },
  };
});
