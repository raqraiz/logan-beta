import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  LS_ADMIN_TESTING_KEY, disableGA, enableGA, enableLiveSession, getAnalyticsConsent,
  isLiveSessionLoaded, setAnalyticsConsent,
} from "@/lib/thirdPartyAnalytics";

// Pages anyone can see without signing in.
const PUBLIC_PATHS = ["/consent", "/privacy", "/unsubscribe", "/s/"];
const isPublicPath = (p: string) => PUBLIC_PATHS.some((x) => p === x || p.startsWith(x));

/** Decides which third-party analytics may run, and shows the consent prompt to signed-in users. */
export function AnalyticsGate() {
  const location = useLocation();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [consent, setConsent] = useState<string | null>(() => getAnalyticsConsent());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user.id ?? null));
    const onConsent = () => setConsent(getAnalyticsConsent());
    globalThis.addEventListener("logan:analytics-consent", onConsent);
    return () => { sub.subscription.unsubscribe(); globalThis.removeEventListener("logan:analytics-consent", onConsent); };
  }, []);

  useEffect(() => {
    if (userId === undefined) return; // still checking sign-in
    const publicContext = userId === null || isPublicPath(location.pathname);

    // Google Analytics
    if (publicContext || consent === "granted") enableGA(); else disableGA();

    // LiveSession: public pages, or admin testing. Once loaded it can't be
    // switched off in place, so reload into a clean page when she signs in.
    if (userId === null) { enableLiveSession(); return; }
    let cancelled = false;
    (async () => {
      let adminTesting = false;
      if (localStorage.getItem(LS_ADMIN_TESTING_KEY) === "on") {
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId!).in("role", ["admin", "super_admin"]);
        adminTesting = !!data?.length;
      }
      if (cancelled) return;
      if (adminTesting) enableLiveSession();
      else if (isLiveSessionLoaded()) window.location.reload();
    })();
    return () => { cancelled = true; };
  }, [userId, location.pathname, consent]);

  if (!userId || consent || isPublicPath(location.pathname)) return null;
  return (
    <div className="fixed inset-x-3 top-3 z-[60] mx-auto max-w-md rounded-2xl border border-border/50 bg-card/90 p-4 text-sm shadow-lg backdrop-blur-xl">
      <p className="text-foreground">Can we collect anonymous usage stats to improve Logan? Nothing you write or log is included.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setAnalyticsConsent("denied")} className="rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground">No thanks</button>
        <button type="button" onClick={() => setAnalyticsConsent("granted")} className="rounded-full bg-primary px-3 py-1.5 text-primary-foreground">Allow</button>
      </div>
    </div>
  );
}
