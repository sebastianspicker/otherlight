/**
 * Keeps canvas figure ink in step with the page's color scheme and fonts.
 */
import { setFigureTheme } from "../render/canvas/figureInk";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Follow the system scheme and redraw figures when it or the web fonts change. */
export function wireFigureTheme(redraw: () => void, signal: AbortSignal): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const query = window.matchMedia(DARK_QUERY);
  const apply = (): void => {
    setFigureTheme(query.matches ? "dark" : "light");
    redraw();
  };
  apply();
  query.addEventListener("change", apply, { signal });
  // Canvas text uses the self-hosted faces; repaint once they are available.
  document.fonts?.ready.then(() => {
    if (!signal.aborted) redraw();
  });
}
