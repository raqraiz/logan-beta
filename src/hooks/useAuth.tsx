import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const ensureProfile = async (user: User) => {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: user.id,
          email: user.email || "",
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        });
      }
    };

    // Listener for ongoing auth changes (does NOT control loading)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      setSession(session);
      setUser(session?.user ?? null);

      // Defer DB calls; never await inside the callback
      if (event === "SIGNED_IN" && session?.user) {
        setTimeout(() => {
          ensureProfile(session.user).catch(() => {
            // Intentionally swallow to avoid leaking sensitive details in console
          });
        }, 0);
      }
    });

    // Initial load (controls loading)
    const initializeAuth = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // PKCE magic-link flow: exchange code for a session
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          url.searchParams.delete("code");
          url.searchParams.delete("type");
          window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        }

        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hasHashTokens =
          hashParams.has("access_token") || hashParams.has("refresh_token");

        // Wait briefly for the SDK to hydrate session from URL tokens (hash or exchanged code)
        const start = Date.now();
        const maxWaitMs = hasHashTokens || code ? 2500 : 0;

        let session: Session | null = null;
        do {
          const { data } = await supabase.auth.getSession();
          session = data.session;
          if (session) break;
          if (!maxWaitMs) break;
          await new Promise((r) => setTimeout(r, 100));
        } while (Date.now() - start < maxWaitMs);

        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await ensureProfile(session.user);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithMagicLink = async (email: string) => {
    const redirectUrl = `${window.location.origin}/chat`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
