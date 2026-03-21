import "./style.css";
import { initApp } from "./app/bootstrap";

initApp().catch((err) => {
  console.error("Fatal: app initialization failed", err);
});
