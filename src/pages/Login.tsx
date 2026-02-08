import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LoganLogo } from "@/components/LoganLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

const passwordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type AuthView = "login" | "signup" | "forgot-password" | "reset-password";

const getInitialView = (): AuthView => {
  // Check sessionStorage flag set by index.html before Supabase cleaned the URL
  const recoveryFlag = sessionStorage.getItem("supabase_password_recovery");
  console.log("[Login Debug] sessionStorage recovery flag:", recoveryFlag);
  
  if (recoveryFlag === "true") {
    sessionStorage.removeItem("supabase_password_recovery");
    console.log("[Login Debug] Returning reset-password view");
    return "reset-password";
  }

  // Fallback: check URL in case it wasn't cleaned yet
  try {
    const url = new URL(window.location.href);
    console.log("[Login Debug] URL search params type:", url.searchParams.get("type"));
    if (url.searchParams.get("type") === "recovery") return "reset-password";

    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    console.log("[Login Debug] Hash type:", hashParams.get("type"));
    if (hashParams.get("type") === "recovery") return "reset-password";
  } catch {
    // ignore
  }

  console.log("[Login Debug] Returning login view");
  return "login";
};

const Login = () => {
  const [view, setView] = useState<AuthView>(getInitialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("reset-password");
        return;
      }

      if (event === "USER_UPDATED") {
        toast({
          title: "Password updated",
          description: "You can now sign in with your new password.",
        });
        setView("login");
        setPassword("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && user && view !== "reset-password") {
      navigate("/chat");
    }
  }, [user, loading, navigate, view]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (view === "forgot-password") {
        const validation = emailSchema.safeParse({ email });
        if (!validation.success) {
          toast({
            title: "Validation error",
            description: validation.error.errors[0].message,
            variant: "destructive",
          });
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/login`,
        });

        if (error) throw error;

        toast({
          title: "Check your email",
          description: "We sent you a password reset link.",
        });

        setView("login");
        setEmail("");
        return;
      }

      if (view === "reset-password") {
        const validation = passwordSchema.safeParse({ password });
        if (!validation.success) {
          toast({
            title: "Validation error",
            description: validation.error.errors[0].message,
            variant: "destructive",
          });
          return;
        }

        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        await supabase.auth.signOut();

        toast({
          title: "Password updated",
          description: "Please sign in with your new password.",
        });

        setView("login");
        setPassword("");
        return;
      }

      const validation = authSchema.safeParse({ email, password });
      if (!validation.success) {
        toast({
          title: "Validation error",
          description: validation.error.errors[0].message,
          variant: "destructive",
        });
        return;
      }

      if (view === "signup") {
        if (!fullName.trim()) {
          toast({ title: "Please enter your name", variant: "destructive" });
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/chat`,
            data: { full_name: fullName.trim() },
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              title: "Account exists",
              description: "This email is already registered. Try signing in instead.",
              variant: "destructive",
            });
          } else {
            throw error;
          }
        } else {
          toast({
            title: "Account created",
            description: "Please check your email to verify your account.",
          });
          setView("login");
          setPassword("");
        }

        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      toast({ title: "Signed in" });
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

  const getTitle = () => {
    switch (view) {
      case "forgot-password":
        return "Reset password";
      case "reset-password":
        return "Set a new password";
      case "signup":
        return "Join Logan";
      default:
        return "Welcome back";
    }
  };

  const getSubtitle = () => {
    switch (view) {
      case "forgot-password":
        return "Enter your email to receive a reset link";
      case "reset-password":
        return "Choose a new password for your account";
      case "signup":
        return "Get personalized cycle insights delivered to you";
      default:
        return "Sign in to continue your conversation";
    }
  };

  const getCardTitle = () => {
    switch (view) {
      case "forgot-password":
        return "Forgot password";
      case "reset-password":
        return "New password";
      case "signup":
        return "Create account";
      default:
        return "Sign in";
    }
  };

  const getButtonText = () => {
    if (isLoading) {
      switch (view) {
        case "forgot-password":
          return "Sending...";
        case "reset-password":
          return "Updating...";
        case "signup":
          return "Creating...";
        default:
          return "Signing in...";
      }
    }

    switch (view) {
      case "forgot-password":
        return "Send reset link";
      case "reset-password":
        return "Update password";
      case "signup":
        return "Create account";
      default:
        return "Sign in";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LoganLogo size="lg" showGlow />
          </div>
          <h1 className="text-2xl font-display font-bold text-primary">{getTitle()}</h1>
          <p className="text-muted-foreground mt-2">{getSubtitle()}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{getCardTitle()}</CardTitle>
            <CardDescription>
              {view === "forgot-password"
                ? "We'll email you a reset link"
                : view === "reset-password"
                ? "Enter your new password below"
                : view === "signup"
                ? "Enter your details to get started"
                : "Enter your email and password"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {view === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Your name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="How should Logan address you?"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-12"
                  />
                </div>
              )}

              {(view === "login" || view === "signup" || view === "forgot-password") && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12"
                    autoComplete="email"
                  />
                </div>
              )}

              {(view === "login" || view === "signup" || view === "reset-password") && (
                <div className="space-y-2">
                  <Label htmlFor="password">
                    {view === "reset-password" ? "New password" : "Password"}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={view === "reset-password" ? "Enter new password" : "••••••••"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 pr-12"
                      autoComplete={
                        view === "signup" || view === "reset-password"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {view === "login" && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setView("forgot-password");
                      setPassword("");
                    }}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button type="submit" disabled={isLoading} className="w-full h-12">
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {getButtonText()}
              </Button>
            </form>

            <div className="mt-6 text-center">
              {view === "forgot-password" || view === "reset-password" ? (
                <button
                  type="button"
                  onClick={() => {
                    setView("login");
                    setEmail("");
                    setPassword("");
                  }}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setView(view === "login" ? "signup" : "login");
                    setPassword("");
                  }}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {view === "login"
                    ? "New here? Create an account"
                    : "Already have an account? Sign in"}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;

