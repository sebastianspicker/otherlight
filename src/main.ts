import "./style.css";
import { renderAppShell } from "./ui/appShell";
import { showFatalAppError } from "./ui/fatalError";

if (typeof document !== "undefined") {
  renderAppShell(document.getElementById("appShellRoot"));
  // Keep the lifecycle-heavy bootstrap behind the browser guard so Node-based
  // characterization tests can import this entry without creating DOM state.
  const { initApp } = await import("./app/bootstrap");

  initApp().catch((err) => {
    console.error("Fatal: app initialization failed", err);
    showFatalAppError(err);
  });
}
