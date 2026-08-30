/** Starts the browser shell and isolates lifecycle-heavy bootstrap from non-DOM imports. */
import "./presentation/styles/style.css";
import { renderAppShell } from "./presentation/ui/appShell";
import { showFatalAppError } from "./presentation/ui/fatalError";

if (typeof document !== "undefined") {
  renderAppShell(document.getElementById("appShellRoot"));
  // Keep the lifecycle-heavy bootstrap behind the browser guard so Node-based
  // characterization tests can import this entry without creating DOM state.
  const { initApp } = await import("./composition/bootstrap");

  initApp().catch((err) => {
    console.error("Fatal: app initialization failed", err);
    showFatalAppError(err);
  });
}
