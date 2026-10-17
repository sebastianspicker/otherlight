/** Configures production bundling and CSP headers, including the explicit loopback V5 boundary. */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, type ConfigEnv, type HtmlTagDescriptor, type UserConfig } from "vite";

type AppCspMode = "serve" | "build" | "github-pages";

export const GITHUB_PAGES_BASE = "/otherlight-exoplanets/";

const SCIENCE_LOOPBACK_SOURCES = "http://127.0.0.1:8765 http://localhost:8765";

const BASE_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
const browserRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(browserRoot, "../..");
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readPackageVersion(): string {
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
    version: unknown;
  };
  if (typeof manifest.version !== "string" || !VERSION_PATTERN.test(manifest.version))
    throw new Error("package.json version must be a semantic version.");
  return manifest.version;
}

/**
 * The commit shown in the page footer so bug reports name the exact build:
 * OTHERLIGHT_BUILD_COMMIT or GITHUB_SHA when set, otherwise local git with a
 * "-dirty" suffix for uncommitted changes. Unknown when git is unavailable or
 * the sources are not the top of their own checkout (for example an extracted
 * tarball inside another repository).
 */
function readBuildCommit(): string {
  const fromEnv = (process.env.OTHERLIGHT_BUILD_COMMIT || process.env.GITHUB_SHA)?.toLowerCase();
  if (fromEnv) {
    if (!COMMIT_PATTERN.test(fromEnv))
      throw new Error("OTHERLIGHT_BUILD_COMMIT/GITHUB_SHA must be a hex commit.");
    return fromEnv.slice(0, 12);
  }
  try {
    const options = {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"],
    };
    // Repository-local config must not run commands during a build.
    const git = (args: string[]) => ["-c", "core.fsmonitor=false", "-c", "diff.external=", ...args];
    const topLevel = execFileSync("git", git(["rev-parse", "--show-toplevel"]), options)
      .toString()
      .trim();
    if (realpathSync(topLevel) !== realpathSync(repositoryRoot)) return "unknown";
    const commit = execFileSync("git", git(["rev-parse", "--short=12", "HEAD"]), options)
      .toString()
      .trim();
    if (!COMMIT_PATTERN.test(commit)) return "unknown";
    const dirty = spawnSync("git", git(["diff", "--quiet", "HEAD"]), options).status === 1;
    return dirty ? `${commit}-dirty` : commit;
  } catch {
    return "unknown";
  }
}

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

  const connectSources = mode === "github-pages" ? "'self'" : `'self' ${SCIENCE_LOOPBACK_SOURCES}`;

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src ${connectSources}`,
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
    injectTo: "head-prepend",
  };
}

export function appViteConfigFor({ command, mode }: ConfigEnv): UserConfig {
  const cspMode: AppCspMode = command === "serve" ? "serve" : "build";
  const isGithubPages = mode === "github-pages";
  const staticCspMode = isGithubPages ? "github-pages" : cspMode;

  return {
    root: browserRoot,
    base: isGithubPages ? GITHUB_PAGES_BASE : "/",
    define: {
      "import.meta.env.VITE_OTHERLIGHT_VERSION": JSON.stringify(readPackageVersion()),
      "import.meta.env.VITE_OTHERLIGHT_COMMIT": JSON.stringify(readBuildCommit()),
    },
    plugins: [
      {
        name: "app-csp-meta",
        transformIndexHtml() {
          return [appCspMetaTag(staticCspMode)];
        },
      },
    ],
    build: {
      outDir: resolve(browserRoot, "../../dist"),
      emptyOutDir: true,
      sourcemap: false,
    },
    // Fixed ports: the loopback science service only accepts these page origins
    // (BROWSER_CORS_ORIGINS in api_http.py), so a silent fallback port would break it.
    server: {
      port: 5173,
      strictPort: true,
      headers: appSecurityHeadersForMode("serve"),
    },
    preview: {
      port: 4173,
      strictPort: true,
      headers: appSecurityHeadersForMode(isGithubPages ? "github-pages" : "build"),
    },
  };
}

export default defineConfig(appViteConfigFor);
