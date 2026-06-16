import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase
        .from("short_links")
        .select("target_url")
        .eq("slug", slug)
        .single();

      if (cancelled) return;

      if (error || !data?.target_url) {
        setStatus("notfound");
        return;
      }

      // Fire-and-forget click increment
      supabase.rpc("increment_short_link_clicks", { _slug: slug }).catch(() => {});

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
