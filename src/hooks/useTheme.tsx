import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeChoice = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeChoice;        // user choice (incl. "system")
  resolved: ResolvedTheme;   // actually applied
  setTheme: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "logan.theme";

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.setAttribute("data-theme", resolved);
}

function readStored(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStored());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const t = readStored();
    return t === "system" ? systemTheme() : t;
  });

  // Apply on mount + whenever choice changes
  useEffect(() => {
    const next: ResolvedTheme = theme === "system" ? systemTheme() : theme;
    setResolved(next);
    applyTheme(next);
  }, [theme]);

  // Watch system changes while in "system" mode
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      const next: ResolvedTheme = mql.matches ? "light" : "dark";
      setResolved(next);
      applyTheme(next);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  // On auth: load persisted preference from Supabase and apply
  useEffect(() => {
    let cancelled = false;
    const loadFromDb = async (userId: string) => {
      const { data } = await supabase
        .from("participants")
        .select("theme_preference")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      const pref = (data?.theme_preference as ThemeChoice | null) ?? null;
      if (pref && pref !== readStored()) {
        window.localStorage.setItem(STORAGE_KEY, pref);
        setThemeState(pref);
      }
    };
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) loadFromDb(data.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) loadFromDb(session.user.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    // Fire-and-forget persistence
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      supabase
        .from("participants")
        .update({ theme_preference: next })
        .eq("user_id", uid)
        .then(() => {});
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
