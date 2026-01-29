import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Lock, Mail, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { LoganLogo } from "@/components/LoganLogo";

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

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<AuthView>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Check if this is a password reset callback
    const type = searchParams.get("type");
    if (type === "recovery") {
      setView("reset-password");
    }
  }, [searchParams]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setView("reset-password");
      } else if (session?.user && view !== "reset-password") {
        navigate("/admin");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && view !== "reset-password") {
        navigate("/admin");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, view]);

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
          setIsLoading(false);
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?type=recovery`,
        });
        
        if (error) throw error;
        
        toast({
          title: "Check your email 📧",
          description: "We've sent you a password reset link.",
        });
        setView("login");
        setEmail("");
      } else if (view === "reset-password") {
        const validation = passwordSchema.safeParse({ password });
        if (!validation.success) {
          toast({
            title: "Validation error",
            description: validation.error.errors[0].message,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        const { error } = await supabase.auth.updateUser({ password });
        
        if (error) throw error;
        
        toast({
          title: "Password updated! 🎉",
          description: "You can now log in with your new password.",
        });
        setView("login");
        setPassword("");
      } else {
        const validation = authSchema.safeParse({ email, password });
        if (!validation.success) {
          toast({
            title: "Validation error",
            description: validation.error.errors[0].message,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        if (view === "login") {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          toast({ title: "Welcome back! 🤖" });
        } else {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/admin`,
            },
          });
          if (error) {
            if (error.message.includes("already registered")) {
              toast({
                title: "Account exists",
                description: "This email is already registered. Try logging in instead.",
                variant: "destructive",
              });
            } else {
              throw error;
            }
          } else {
            toast({
              title: "Account created! 🎉",
              description: "You can now log in to the admin dashboard.",
            });
            setView("login");
          }
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
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
        return "Set new password";
      case "signup":
        return "Create your account";
      default:
        return "Welcome back";
    }
  };

  const getButtonText = () => {
    if (isLoading) return "Please wait...";
    switch (view) {
      case "forgot-password":
        return "Send reset link";
      case "reset-password":
        return "Update password";
      case "signup":
        return "Sign Up";
      default:
        return "Log In";
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl p-8 md:p-10 shadow-card border border-border">
          {/* Logo and Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <LoganLogo size="lg" showGlow />
            </div>
            <h1 className="text-2xl font-display font-bold text-primary">Logan</h1>
            <p className="text-muted-foreground mt-2">{getTitle()}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {(view === "login" || view === "signup" || view === "forgot-password") && (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-xl"
                  />
                </div>
              </div>
            )}

            {(view === "login" || view === "signup" || view === "reset-password") && (
              <div className="space-y-2">
                <Label htmlFor="password" className="text-muted-foreground">
                  {view === "reset-password" ? "New Password" : "Password"}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={view === "reset-password" ? "New password" : "Password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-xl pr-12"
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

            <Button 
              type="submit" 
              className="w-full h-14 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow" 
              disabled={isLoading}
            >
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
                Back to login
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setView(view === "login" ? "signup" : "login")}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {view === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            ← Back to home
          </a>
        </div>
      </div>
    </div>
  );
};

export default Auth;
