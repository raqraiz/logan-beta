import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { recordShortLinkAttribution } from "@/lib/attribution";

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
      const { data, error } = await (supabase as any)
        .from("short_links")
        .select("target_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content")
        .eq("slug", slug)
        .single();

      if (cancelled) return;

      if (error || !data?.target_url) {
        setStatus("notfound");
        return;
      }

      // Persist the campaign behind this short link before the redirect, so the
      // signup is credited even if the tagged target page never gets to record it.
      recordShortLinkAttribution({
        slug,
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? null,
        utm_term: data.utm_term ?? null,
        utm_content: data.utm_content ?? null,
      });

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
