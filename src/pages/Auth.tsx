import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Mail, Sparkles } from "lucide-react";
import { z } from "zod";
import { LoganLogo } from "@/components/LoganLogo";

const AUTHORIZED_EMAILS = [
  "raquella.siegel@gmail.com",
  "liying.i.wang@gmail.com",
];

const emailSchema = z.string().email("Please enter a valid email");

const Auth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Check if user is authorized
        if (AUTHORIZED_EMAILS.includes(session.user.email?.toLowerCase() || "")) {
          navigate("/admin");
        } else {
          // Sign out unauthorized users
          supabase.auth.signOut();
          toast({
            title: "Access denied",
            description: "You are not authorized to access the admin area.",
            variant: "destructive",
          });
        }
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        if (AUTHORIZED_EMAILS.includes(session.user.email?.toLowerCase() || "")) {
          navigate("/admin");
        } else {
          supabase.auth.signOut();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = emailSchema.safeParse(email);
    if (!validation.success) {
      toast({
        title: "Validation error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    // Check if email is authorized
    if (!AUTHORIZED_EMAILS.includes(email.toLowerCase())) {
      toast({
        title: "Access denied",
        description: "This email is not authorized to access the admin area.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/admin`,
        },
      });

      if (error) throw error;
      
      setMagicLinkSent(true);
      toast({ 
        title: "Magic link sent! ✨",
        description: "Check your email and click the link to sign in.",
      });
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl p-8 md:p-10 shadow-card border border-border">
          {/* Logo and Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <LoganLogo size="lg" showGlow />
            </div>
            <h1 className="text-2xl font-display font-bold text-primary">Logan Admin</h1>
            <p className="text-muted-foreground mt-2">
              {magicLinkSent ? "Check your email" : "Sign in with magic link"}
            </p>
          </div>

          {magicLinkSent ? (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-foreground font-medium">Magic link sent to:</p>
                <p className="text-primary font-semibold">{email}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Click the link in your email to sign in. The link expires in 1 hour.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setMagicLinkSent(false);
                  setEmail("");
                }}
                className="w-full"
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 bg-input border-border text-foreground placeholder:text-muted-foreground rounded-xl pl-12"
                  />
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow" 
                disabled={isLoading}
              >
                {isLoading ? "Sending..." : "Send Magic Link"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Only authorized admin emails can access this area.
              </p>
            </form>
          )}
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
