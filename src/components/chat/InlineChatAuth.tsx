import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowRight } from "lucide-react";
import { LoganLogo } from "@/components/LoganLogo";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type AuthView = "signup" | "signin" | "forgot-password";

interface InlineChatAuthProps {
  onAuthSuccess?: () => void;
  defaultView?: AuthView;
}

export const InlineChatAuth = ({ onAuthSuccess, defaultView }: InlineChatAuthProps) => {
  const [view, setView] = useState<AuthView>(defaultView || "signup");

  useEffect(() => {
    if (defaultView) setView(defaultView);
  }, [defaultView]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  

  const isSignUp = view === "signup";
  const isForgotPassword = view === "forgot-password";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    

    if (isForgotPassword) {
      if (!z.string().email().safeParse(email).success) {
        toast({ title: "Please enter a valid email", variant: "destructive" });
        return;
      }
      setIsLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({ title: "Check your email 📧", description: "We've sent you a password reset link." });
        setView("signin");
        setEmail("");
      } catch (error) {
        toast({ title: "Something went wrong", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      toast({ title: "Validation error", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }

    if (isSignUp && !fullName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }

    if (isSignUp && !consentGiven) {
      toast({ title: "Consent required", description: "Please review and accept the terms to continue.", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { 
              full_name: fullName.trim(),
              consent_given: true,
              consent_given_at: new Date().toISOString(),
            },
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            toast({ title: "Account exists", description: "This email is already registered. Try signing in instead.", variant: "destructive" });
            setView("signin");
          } else {
            throw error;
          }
        } else {
          // Fire-and-forget welcome email
          try {
            const userId = data?.user?.id;
            supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "welcome",
                recipientEmail: email.trim(),
                idempotencyKey: userId ? `welcome-${userId}` : `welcome-${email.trim()}`,
                templateData: { name: fullName.trim() || null },
              },
            }).catch((e) => console.error("Welcome email send failed:", e));
          } catch (e) {
            console.error("Welcome email invoke error:", e);
          }
          toast({ title: "Welcome to Logan 🎉" });
          onAuthSuccess?.();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        
        toast({ title: "Welcome back!" });
        onAuthSuccess?.();
      }
    } catch (error) {
      console.error("Auth error:", error);
      toast({ title: "Something went wrong", description: error instanceof Error ? error.message : "Please try again", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-2 pb-6">
      <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-lg">
        {/* Value proposition — only shown for forgot password / sign in views.
            Sign-up context is already provided by the surrounding TrialChat headline. */}
        {(isForgotPassword || (!isSignUp && !isForgotPassword)) && (
          <div className="mb-6">
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 inline-block max-w-[90%]">
              <p className="text-foreground text-sm">
                {isForgotPassword
                  ? "No worries — enter your email and I'll send you a link to reset your password."
                  : "Welcome back. Sign in to pick up where we left off."}
              </p>
            </div>
          </div>
        )}

        {/* Logo divider — sits in the gap above the first form field */}
        {isSignUp && !isForgotPassword && (
          <div className="flex justify-center mb-4">
            <LoganLogo size="md" />
          </div>
        )}


        {/* Inline auth form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && !isForgotPassword && (
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-muted-foreground text-sm">
                What should I call you?
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-12 bg-background"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-muted-foreground text-sm">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
                onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-background"
              autoComplete="email"
            />
          </div>

          {!isForgotPassword && (
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-sm">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-background pr-12"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
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
          )}

          {/* Forgot password link on sign-in view */}
          {view === "signin" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => { setView("forgot-password"); setPassword(""); }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Consent checkbox for signup */}
          {isSignUp && !isForgotPassword && (
            <div className="flex items-start gap-3 py-2">
              <Checkbox
                id="consent"
                checked={consentGiven}
                onCheckedChange={(checked) => setConsentGiven(checked === true)}
                className="mt-0.5"
              />
              <Label 
                htmlFor="consent" 
                className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
              >
                I agree to the{" "}
                <Link 
                  to="/consent" 
                  target="_blank"
                  className="text-primary underline hover:text-primary/80"
                >
                  terms & privacy policy
                </Link>
                , including consent to receive cycle guidance through Logan.
              </Label>
            </div>
          )}

          <Button type="submit" disabled={isLoading || (isSignUp && !isForgotPassword && !consentGiven)} className="w-full h-12 !bg-black !text-white hover:opacity-90 disabled:opacity-50">
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : !isForgotPassword ? (
              <LoganLogo size="sm" className="w-5 h-5 mr-2" />
            ) : null}
            {isLoading
              ? isForgotPassword ? "Sending..." : isSignUp ? "Creating account..." : "Signing in..."
              : isForgotPassword ? "Send reset link" : isSignUp ? "Start my journey" : "Continue chatting"
            }
            {!isLoading && !isForgotPassword && <ArrowRight className="w-4 h-4 ml-2" />}
          </Button>
        </form>

        <div className="mt-4 text-center space-y-2">
          {isForgotPassword ? (
            <button
              type="button"
              onClick={() => { setView("signin"); setPassword(""); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ← Back to sign in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setView(isSignUp ? "signin" : "signup");
                setPassword("");
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
