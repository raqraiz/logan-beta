import { useEffect } from "react";

/**
 * The back office is light only. The app follows the device's dark setting by putting a `dark`
 * class on <html>, and dialogs, popovers and menus render outside the page, so they would pick
 * it up. While a back office screen is open, keep that class off, then put the device's
 * setting back when she leaves.
 */
export function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const strip = () => { if (root.classList.contains("dark")) root.classList.remove("dark"); };
    strip();
    const observer = new MutationObserver(strip);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      const dark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", dark);
    };
  }, []);
}
