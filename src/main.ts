import "./style.css";
import { renderAppShell } from "./ui/appShell";

if (typeof document !== "undefined") {
  renderAppShell(document.getElementById("appShellRoot"));
  const { initApp } = await import("./app/bootstrap");

  initApp().catch((err) => {
    console.error("Fatal: app initialization failed", err);
  });
}
