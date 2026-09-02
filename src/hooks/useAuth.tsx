import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session, type EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  backfillAttribution,
  getAttribution,
  getAttributionFromUserMetadata,
  getSignupAttributionMetadata,
} from "@/lib/attribution";

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
    .maybeSingle();

  if (!existingProfile) {
    // Strip ref_code — it's not a column on profiles; it's resolved to
    // referred_by by the backfill-attribution edge function.
    // Priority: user_metadata (captured at signUp, survives cross-browser
    // email confirmation) > localStorage (same-browser) > backfill (later).
    const metaAttribution = getAttributionFromUserMetadata(user.user_metadata);
    const localAttribution = getAttribution();
    if (
      import.meta.env.DEV &&
      metaAttribution?.utm_source &&
      localAttribution?.utm_source &&
      metaAttribution.utm_source !== localAttribution.utm_source
    ) {
      console.warn(
        `attribution conflict: user_metadata=${metaAttribution.utm_source} localStorage=${localAttribution.utm_source}`
      );
    }
    const attribution = metaAttribution ?? localAttribution;
    const { ref_code: _refCode, ...attributionForProfile } = attribution ?? {};

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email || "",
        full_name:
          user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        ...attributionForProfile,
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("ensureProfile upsert failed:", error);
    }
  }
};

// Fallback for referral codes the user typed in manually at signup.
// Only fills referred_by when automatic attribution left it null, so a
// captured ?ref= click always wins and nobody gets double-credited.
const applyManualReferralCode = async (user: User): Promise<boolean> => {
  const raw = user.user_metadata?.manual_referral_code;
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!code) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, referred_by")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.referred_by) return false;

  const { data: referrerId, error } = await supabase.rpc("resolve_referral_code", { _code: code });
  if (error) {
    console.warn("manual referral code lookup failed:", error.message);
    return false;
  }
  if (!referrerId || referrerId === user.id) {
    // Unknown or self-referral code — silently ignore, never block signup.
    console.info("manual referral code not matched:", code);
    return false;
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ referred_by: referrerId })
    .eq("id", user.id)
    .is("referred_by", null);
  if (updateErr) {
    console.warn("manual referral credit failed:", updateErr.message);
    return false;
  }
  return true;
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

  // Ensure profile exists, then backfill any missing UTM attribution.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        await ensureProfile(user);
      } catch {
        // Profile creation is best-effort and should not block auth.
      }
      // Always attempt backfill — server only fills currently-null fields.
      try {
        await backfillAttribution();
      } catch {
        // best-effort
      }
      // Manual referral code fallback: only applies when automatic
      // attribution produced nothing. Never overwrites an existing referrer.
      try {
        await applyManualReferralCode(user);
      } catch {
        // best-effort — must never block or surface an error at signup.
      }
    })();
  }, [user?.id]);


  const signInWithMagicLink = async (email: string) => {
    const redirectUrl = `${window.location.origin}/auth/callback?next=/`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
        data: { ...getSignupAttributionMetadata() },
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
