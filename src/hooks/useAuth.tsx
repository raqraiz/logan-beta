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

const ATTRIBUTION_COLUMNS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "referrer",
  "landing_path",
  "landing_at",
] as const;

const ensureProfile = async (user: User) => {
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select(
      "id, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_path, landing_at"
    )
    .eq("id", user.id)
    .maybeSingle();

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

  if (!existingProfile) {
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
    return;
  }

  // A profile row can already exist before this runs — chat-onboarding creates
  // an early shell (id/email/full_name). Don't skip attribution in that case:
  // fill only the columns that are still NULL (first-touch preserved).
  const patch: Record<string, string> = {};
  for (const col of ATTRIBUTION_COLUMNS) {
    const existingValue = (existingProfile as Record<string, unknown>)[col];
    const incoming = (attributionForProfile as Record<string, unknown>)[col];
    if (!existingValue && typeof incoming === "string" && incoming) {
      patch[col] = incoming;
    }
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id);
    if (error) {
      console.error("ensureProfile attribution patch failed:", error);
    }
  }
};

// Fallback for referral codes the user typed in manually at signup.
// The server reads the code from her own sign-up details and attaches the
// referrer only when automatic attribution left it empty, so a captured ?ref=
// click always wins and nobody gets double-credited. The app never learns who
// the referrer is.
const applyManualReferralCode = async (user: User): Promise<boolean> => {
  const raw = user.user_metadata?.manual_referral_code;
  if (typeof raw !== "string" || !raw.trim()) return false;

  const { data, error } = await (supabase as any).rpc("apply_manual_referral_code");
  if (error) {
    console.warn("manual referral code could not be applied:", error.message);
    return false;
  }
  return data === true;
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
        const credited = await applyManualReferralCode(user);
        // If the manual code was what established referred_by, the reconciliation
        // pass above ran too early to see it. Re-run it now so the referral
        // source is stamped live at signup instead of waiting for a batch job.
        // (Precedence unchanged: real UTM params still win over the fallback.)
        if (credited) await backfillAttribution();
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
