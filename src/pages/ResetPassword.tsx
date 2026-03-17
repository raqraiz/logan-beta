import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { LoganLogo } from "@/components/LoganLogo";
import { useAuth } from "@/hooks/useAuth";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid">("loading");

  useEffect(() => {
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && nextSession?.user)) {
        setStatus("ready");
      }

      if (event === "USER_UPDATED") {
        toast({
          title: "Password updated! 🎉",
          description: "You can now sign in with your new password.",
        });
        navigate("/");
      }
    });

    const initializeRecovery = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const hash = window.location.hash;
      const hasRecoveryHash =
        hash.includes("type=recovery") ||
        hash.includes("access_token=") ||
        hash.includes("refresh_token=");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          if (isMounted) setStatus("invalid");
          return;
        }

        if (isMounted) setStatus("ready");
        return;
      }

      if (hasRecoveryHash) {
        if (isMounted) setStatus("ready");
        return;
      }

      if (authLoading) {
        return;
      }

      if (session?.user) {
        if (isMounted) setStatus("ready");
        return;
      }

      if (isMounted) setStatus("invalid");
    };

    void initializeRecovery();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [authLoading, navigate, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast({ title: "Password updated! 🎉", description: "Please sign in with your new password." });
      navigate("/");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-lg text-center space-y-4">
            <LoganLogo size="md" className="mx-auto" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">This reset link is invalid</h1>
              <p className="text-sm text-muted-foreground">Please request a new password reset email and use the latest link.</p>
            </div>
            <Button className="w-full" onClick={() => navigate("/")}>Back to sign in</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-lg">
          <div className="text-center mb-6">
            <LoganLogo size="md" className="mx-auto mb-3" />
            <h1 className="text-xl font-semibold text-foreground">Set new password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your new password below.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-sm">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-background pr-12"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full h-12">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isLoading ? "Updating..." : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
