import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Capture password recovery state BEFORE Supabase processes and cleans the URL hash
(() => {
  try {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get("type") === "recovery") {
      sessionStorage.setItem("supabase_password_recovery", "true");
    }
  } catch {
    // ignore
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
