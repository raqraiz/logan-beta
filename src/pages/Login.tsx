import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LoganLogo } from "@/components/LoganLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
  const { user, loading, signInWithMagicLink } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/chat");
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({ title: "Please enter your email", variant: "destructive" });
      return;
    }

    if (isSignUp && !fullName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await signInWithMagicLink(email.trim());

      if (error) {
        throw error;
      }

      setEmailSent(true);
      toast({
        title: "Check your email",
        description: "We sent you a magic link to sign in.",
      });
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
          <h1 className="text-2xl font-display font-bold text-primary">
            {isSignUp ? "Join Logan" : "Welcome Back"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isSignUp 
              ? "Get personalized cycle insights delivered to you" 
              : "Sign in to continue your conversation"}
          </p>
        </div>

        {emailSent ? (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Check your inbox</h2>
                <p className="text-muted-foreground mt-2">
                  We sent a magic link to <strong>{email}</strong>
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  Click the link in the email to sign in. No password needed.
                </p>
              </div>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setEmailSent(false)}
              >
                Use a different email
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="w-5 h-5" />
                {isSignUp ? "Create Account" : "Sign In"}
              </CardTitle>
              <CardDescription>
                {isSignUp 
                  ? "Enter your details to get started"
                  : "Enter your email to receive a magic link"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Your Name</Label>
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

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending link...
                    </>
                  ) : (
                    "Continue with Email"
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
                </button>
              </div>
            </CardContent>
          </Card>
        )}

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
