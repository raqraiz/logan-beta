import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

interface InlineChatAuthProps {
  onAuthSuccess?: () => void;
}

export const InlineChatAuth = ({ onAuthSuccess }: InlineChatAuthProps) => {
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      toast({
        title: "Validation error",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    if (isSignUp && !fullName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }

    if (isSignUp && !consentGiven) {
      toast({ 
        title: "Consent required", 
        description: "Please review and accept the terms to continue.",
        variant: "destructive" 
      });
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
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
            toast({
              title: "Account exists",
              description: "This email is already registered. Try signing in instead.",
              variant: "destructive",
            });
            setIsSignUp(false);
          } else {
            throw error;
          }
        } else {
          toast({
            title: "Check your email",
            description: "We sent you a verification link to complete signup.",
          });
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
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border p-6 shadow-lg">
        {/* Welcome message styled as chat bubble */}
        <div className="mb-6">
          <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 inline-block max-w-[90%]">
            <p className="text-foreground">
              {isSignUp 
                ? "Hey! 👋 I'm Logan, your intelligent cycle companion. Let's get you set up so I can start learning your patterns."
                : "Welcome back! 👋 Sign in to continue our conversation."
              }
            </p>
          </div>
        </div>

        {/* Inline auth form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
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

          {/* Consent checkbox for signup */}
          {isSignUp && (
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

          <Button type="submit" disabled={isLoading || (isSignUp && !consentGiven)} className="w-full h-12">
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {isLoading
              ? isSignUp ? "Creating account..." : "Signing in..."
              : isSignUp ? "Start my journey" : "Continue chatting"
            }
            {!isLoading && <ArrowRight className="w-4 h-4 ml-2" />}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setPassword("");
            }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
        </div>

      </div>
    </div>
  );
};
