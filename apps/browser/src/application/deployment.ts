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
