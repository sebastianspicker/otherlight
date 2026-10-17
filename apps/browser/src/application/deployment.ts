/** Provides runtime deployment facts for presentation-layer assets and availability. */

export function isGitHubPagesMode(mode: string): boolean {
  return mode === "github-pages";
}

export function isGitHubPagesRuntime(): boolean {
  return import.meta.env.MODE === "github-pages";
}

export function runtimeAssetUrl(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

/** Version and commit baked in at build time (see vite.config.ts); "dev" when run without Vite. */
export function buildIdentity(): string {
  const version = (import.meta.env.VITE_OTHERLIGHT_VERSION as string | undefined) ?? "dev";
  const commit = import.meta.env.VITE_OTHERLIGHT_COMMIT as string | undefined;
  return commit ? `${version} · build ${commit}` : version;
}
