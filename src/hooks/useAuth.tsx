import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session, type EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getAttribution } from "@/lib/attribution";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ensureProfile = async (user: User) => {
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (!existingProfile) {
    const attribution = getAttribution();
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email || "",
      full_name:
        user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
      ...(attribution ?? {}),
    });
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Ongoing auth changes (does NOT control loading)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
    });

    // Initial load (controls loading)
    const initializeAuth = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const authType = url.searchParams.get("type");
        let exchangedSession: Session | null = null;

        // PKCE auth flow: exchange ?code= for a session and keep the returned session
        if (code) {
          try {
            const { data } = await supabase.auth.exchangeCodeForSession(code);
            exchangedSession = data.session;
          } catch {
            // Ignore: code might have been already exchanged on a previous attempt
          }

          url.searchParams.delete("code");
          url.searchParams.delete("type");
          window.history.replaceState(
            {},
            document.title,
            url.pathname + url.search + url.hash
          );
        } else if (tokenHash && authType) {
          try {
            const { data } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: authType as EmailOtpType,
            });
            exchangedSession = data.session;
          } catch {
            // Ignore: token may already be verified or expired
          }

          url.searchParams.delete("token_hash");
          url.searchParams.delete("type");
          window.history.replaceState(
            {},
            document.title,
            url.pathname + url.search + url.hash
          );
        }

        // Implicit flow: access_token/refresh_token in hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hasHashTokens =
          hashParams.has("access_token") || hashParams.has("refresh_token");

        // If tokens are present in the URL, give the SDK a moment to hydrate
        const start = Date.now();
        const maxWaitMs = hasHashTokens || code || Boolean(tokenHash) ? 5000 : 0;

        let currentSession: Session | null = exchangedSession;
        while (!currentSession) {
          const { data } = await supabase.auth.getSession();
          currentSession = data.session;
          if (currentSession || !maxWaitMs || Date.now() - start >= maxWaitMs) {
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }

        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          await ensureProfile(currentSession.user);
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

  // Ensure profile exists when a user appears (after initial load too)
  useEffect(() => {
    if (!user) return;
    ensureProfile(user).catch(() => {
      // Ignore: profile creation is best-effort and should not block auth
    });
  }, [user?.id]);

  const signInWithMagicLink = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth/callback?next=/`;

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
    <AuthContext.Provider
      value={{ user, session, loading, signInWithMagicLink, signOut }}
    >
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
