import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { LoganLogo } from "@/components/LoganLogo";

type Status = "loading" | "ready" | "success" | "invalid" | "error";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.valid === false) {
          setStatus("invalid");
          return;
        }
        if (data?.already_unsubscribed) {
          setEmail(data?.email ?? null);
          setStatus("success");
          return;
        }
        setEmail(data?.email ?? null);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full bg-card/80 backdrop-blur-sm rounded-2xl border border-border p-8 shadow-lg text-center">
        <div className="flex justify-center mb-6">
          <LoganLogo size="md" />
        </div>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p>Checking your link…</p>
          </div>
        )}

        {status === "ready" && (
          <>
            <h1 className="text-xl font-semibold mb-3">Unsubscribe from Logan emails?</h1>
            <p className="text-muted-foreground mb-6">
              {email ? <>You'll stop receiving emails at <strong>{email}</strong>.</> : "You'll stop receiving emails from Logan."}
            </p>
            <Button onClick={confirm} disabled={submitting} className="w-full h-12">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm unsubscribe
            </Button>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-xl font-semibold mb-3">You're unsubscribed 💚</h1>
            <p className="text-muted-foreground">
              {email ? <><strong>{email}</strong> won't receive any more emails from Logan.</> : "You won't receive any more emails from Logan."}
            </p>
          </>
        )}

        {status === "invalid" && (
          <>
            <h1 className="text-xl font-semibold mb-3">Link is invalid or expired</h1>
            <p className="text-muted-foreground">
              This unsubscribe link is no longer valid. If you'd like to stop receiving emails, reply to any Logan email and we'll take care of it.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-xl font-semibold mb-3">Something went wrong</h1>
            <p className="text-muted-foreground">Please try the link again in a moment.</p>
          </>
        )}
      </div>
    </div>
  );
}
