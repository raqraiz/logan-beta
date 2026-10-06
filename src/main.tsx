import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { captureAttribution } from "./lib/attribution";

// Capture UTM/referrer/landing path before React renders so signups can attach it.
captureAttribution();

// Follow the device light/dark setting app-wide (light by default).
const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", !!darkQuery?.matches);
applyTheme();
darkQuery?.addEventListener?.("change", applyTheme);

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
