import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LoganLogo } from "@/components/LoganLogo";
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
  const { session, loading } = useAuth();

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next && next.startsWith("/") ? next : "/";
  }, [searchParams]);

  useEffect(() => {
    if (loading) return;
    // AuthProvider has finished — if session exists, redirect
    if (session) {
      navigate(nextPath, { replace: true });
    } else {
      // No session after auth finished — go to home
      navigate("/", { replace: true });
    }
  }, [loading, session, navigate, nextPath]);

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
              Hang tight while we finish verifying your link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthCallback;
