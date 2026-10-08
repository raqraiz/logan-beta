import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { recordShortLinkAttribution } from "@/lib/attribution";

// Counts the click without ever holding up or breaking the redirect: fire and forget, 1.5 second limit, errors ignored.
// Sends the link name only; nothing about the visitor.
function recordClick(slug: string) {
  try {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/record_link_click`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ _slug: slug }),
      keepalive: true,
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
  } catch {
    // never block the redirect
  }
}

export default function ShortRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<"loading" | "notfound">("loading");

  useEffect(() => {
    if (!slug) {
      setStatus("notfound");
      return;
    }

    let cancelled = false;

    const go = async () => {
      // Public view: slug and target_url only. Falls back to the table until the
      // matching migration is applied (remove once it is live).
      let { data, error } = await (supabase as any)
        .from("short_links_public")
        .select("target_url")
        .eq("slug", slug)
        .maybeSingle();
      if (error && (error.code === "PGRST205" || error.code === "42P01")) {
        ({ data, error } = await (supabase as any)
          .from("short_links")
          .select("target_url")
          .eq("slug", slug)
          .maybeSingle());
      }

      if (cancelled) return;

      if (error || !data?.target_url) {
        setStatus("notfound");
        return;
      }

      // The campaign tags travel inside the target URL, so read them from there.
      const utm = { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null } as Record<string, string | null>;
      try {
        const q = new URL(data.target_url).searchParams;
        for (const k of Object.keys(utm)) utm[k] = q.get(k);
      } catch {
        // not a parseable URL: skip attribution, still redirect
      }

      // Persist the campaign behind this short link before the redirect, so the
      // signup is credited even if the tagged target page never gets to record it.
      recordShortLinkAttribution({
        slug,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_term: utm.utm_term,
        utm_content: utm.utm_content,
      });

      recordClick(slug);
      window.location.replace(data.target_url);
    };

    go();
    return () => { cancelled = true; };
  }, [slug]);

  if (status === "notfound") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">404</h1>
          <p className="mb-4 text-xl text-muted-foreground">Link not found</p>
          <a href="/" className="text-primary underline hover:text-primary/90">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Taking you there...</p>
      </div>
    </div>
  );
}
