import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { LoganLogo } from "@/components/LoganLogo";
import { usePasswordResetRequest } from "@/hooks/usePasswordResetRequest";
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT_MESSAGE } from "@/lib/passwordReset";

// The Supabase client strips the URL hash as soon as it starts up, so read what
// the link carried once, when this file loads.
const initialLink = (() => {
  if (typeof window === "undefined") return { search: "", hash: "" };
  return { search: window.location.search, hash: window.location.hash };
})();

type Stage =
  | "checking" // legacy links only: waiting for the session from the link
  | "confirm" // new links: waiting for her to tap Continue
  | "verifying"
  | "ready" // she can choose a new password
  | "expired" // link used up or past its time limit
  | "invalid"; // link incomplete or damaged

const readLink = () => {
  const params = new URLSearchParams(initialLink.search || window.location.search);
  const hash = new URLSearchParams((initialLink.hash || window.location.hash).replace(/^#/, ""));
  return {
    tokenHash: params.get("token_hash"),
    type: params.get("type"),
    hashError: hash.get("error_code") || hash.get("error"),
    hasLegacyTokens: hash.has("access_token") || hash.get("type") === "recovery",
  };
};

const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT_MESSAGE);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background flex items-center justify-center px-4">
    <div className="w-full max-w-md">
      <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-lg space-y-4">
        <LoganLogo size="md" className="mx-auto" />
        {children}
      </div>
    </div>
  </div>
);

const RequestNewLink = ({ lead }: { lead: string }) => {
  const [email, setEmail] = useState("");
  const { send, isSending, sent, error, cooldown } = usePasswordResetRequest();
  const validEmail = z.string().email().safeParse(email.trim()).success;

  return (
    <form
      className="space-y-3 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        if (validEmail) void send(email);
      }}
    >
      <p className="text-sm text-muted-foreground text-center">{lead}</p>
      <Label htmlFor="reset-email" className="text-muted-foreground text-sm">Email</Label>
      <Input
        id="reset-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-12 bg-background"
      />
      {sent && (
        <p className="text-sm text-foreground bg-muted rounded-lg px-3 py-2" role="status">
          New link sent. Please check your inbox and your spam folder too. Use the newest email and tap the link soon after it arrives.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}
      <Button type="submit" className="w-full h-12" disabled={!validEmail || isSending || cooldown > 0}>
        {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        {isSending ? "Sending..." : cooldown > 0 ? `Send again in ${cooldown}s` : "Send me a new link"}
      </Button>
    </form>
  );
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const link = useRef(readLink()).current;
  const [stage, setStage] = useState<Stage>(() => {
    if (link.hashError) return "expired";
    if (link.tokenHash && link.type === "recovery") return "confirm";
    if (link.hasLegacyTokens) return "checking";
    return "invalid";
  });
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Links sent before the scanner-proof change arrive with the session already
  // in the URL; wait for the Supabase client to pick it up.
  useEffect(() => {
    if (stage !== "checking") return;
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!cancelled && event === "PASSWORD_RECOVERY") setStage("ready");
    });

    (async () => {
      const deadline = Date.now() + 8000;
      while (!cancelled && Date.now() < deadline) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (!cancelled) setStage("ready");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!cancelled) setStage("expired");
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [stage]);

  // The one-time token is only used here, when she taps Continue. Email
  // scanners that pre-open the link never press the button.
  const handleContinue = async () => {
    if (!link.tokenHash) return;
    setStage("verifying");
    setVerifyError(null);
    const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: "recovery" });
    if (!error) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setStage("ready");
      return;
    }
    const isConnectionProblem = error.name === "AuthRetryableFetchError" || error.status === 0;
    if (isConnectionProblem) {
      setVerifyError("We couldn't reach Logan. Check your connection and tap Continue again.");
      setStage("confirm");
      return;
    }
    setStage("expired");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      toast({ title: validation.error.errors[0].message, variant: "destructive" });
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setIsSaving(false);
      toast({
        title: "We couldn't update your password",
        description:
          error.code === "same_password"
            ? "Please choose a password that's different from your old one."
            : error.code === "weak_password"
              ? error.message
              : "Please try again. If it keeps happening, request a new link.",
        variant: "destructive",
      });
      return;
    }

    // verifyOtp already signed her in, so she goes straight into the app.
    toast({ title: "Password updated", description: "You're signed in." });
    navigate("/", { replace: true });
  };

  if (stage === "checking" || stage === "verifying") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (stage === "confirm") {
    return (
      <Shell>
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground">Tap Continue to choose a new password for your Logan account.</p>
        </div>
        {verifyError && <p className="text-sm text-destructive text-center" role="alert">{verifyError}</p>}
        <Button className="w-full h-12" onClick={handleContinue}>Continue</Button>
      </Shell>
    );
  }

  if (stage === "expired" || stage === "invalid") {
    const expired = stage === "expired";
    return (
      <Shell>
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-foreground">
            {expired ? "This link has expired or was already used" : "This link doesn't look right"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {expired
              ? "Some email providers open links automatically, which can use them up. A new link will fix it."
              : "It may have been cut off when it was copied. A new link will fix it."}
          </p>
        </div>
        <RequestNewLink lead="Enter your email and we'll send a fresh link." />
        <Button variant="ghost" className="w-full" onClick={() => navigate("/")}>Back to sign in</Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center">
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
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>

        <Button type="submit" disabled={isSaving} className="w-full h-12">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {isSaving ? "Updating..." : "Update password"}
        </Button>
      </form>
    </Shell>
  );
};

export default ResetPassword;
