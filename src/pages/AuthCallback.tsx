import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoganLogo } from "@/components/LoganLogo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next && next.startsWith("/") ? next : "/chat";
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // If already signed in, go straight through.
        const existing = await supabase.auth.getSession();
        if (existing.data.session) {
          navigate(nextPath, { replace: true });
          return;
        }

        const code = searchParams.get("code");
        if (code) {
          try {
            await supabase.auth.exchangeCodeForSession(code);
          } catch {
            // ignore; we will verify via getSession below
          }
        }

        // Give the SDK a moment to persist session
        const start = Date.now();
        const maxWaitMs = 2500;
        while (Date.now() - start < maxWaitMs) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            navigate(nextPath, { replace: true });
            return;
          }
          await new Promise((r) => setTimeout(r, 100));
        }

        if (!cancelled) {
          setError("We couldn't finish signing you in. Please request a new magic link.");
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "We couldn't finish signing you in. Please try again."
          );
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate, nextPath, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <LoganLogo size="lg" showGlow />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Signing you in…</CardTitle>
            <CardDescription>
              Hang tight while we finish verifying your magic link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>

            {error && (
              <div className="text-sm text-muted-foreground text-center space-y-3">
                <p>{error}</p>
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link to="/login">Back to sign in</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to={nextPath}>Try going to chat</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthCallback;
