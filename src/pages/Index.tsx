import { Link } from "react-router-dom";
import { OnboardingForm } from "@/components/OnboardingForm";
import { Heart, MessageCircle, Sparkles, Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen gradient-soft">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center">
              <Heart className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-semibold text-lg">Logan</span>
          </div>
          <Link to="/admin">
            <Button variant="ghost" size="sm">Admin</Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Hero Content */}
            <div className="space-y-6 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span>4-Week Pilot Program</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight">
                Meet <span className="text-gradient">Logan</span>, your{" "}
                <span className="text-gradient">cycle companion</span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-lg">
                Hyper-personalized predictions, recommendations, and check-ins 
                delivered directly to your WhatsApp. Because your cycle deserves 
                attention, not guesswork.
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                {[
                  { icon: MessageCircle, text: "WhatsApp insights" },
                  { icon: Sparkles, text: "AI-powered" },
                  { icon: Calendar, text: "2x weekly" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="w-4 h-4 text-primary" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - Onboarding Form */}
            <div className="lg:pl-8">
              <div className="bg-card rounded-2xl p-6 md:p-8 shadow-card border border-border/50 max-w-md mx-auto">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-display font-semibold mb-2">Join the Pilot</h2>
                  <p className="text-sm text-muted-foreground">
                    Get early access to Logan's personalized insights
                  </p>
                </div>
                <OnboardingForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-4">How Logan Works</h2>
            <p className="text-muted-foreground">Simple, personal, powerful</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Share your info",
                description: "Tell Logan about your cycle, symptoms, and goals. Takes less than 2 minutes.",
                icon: Heart,
              },
              {
                step: "02",
                title: "Receive insights",
                description: "Get personalized predictions and recommendations via WhatsApp on Saturdays and Tuesdays.",
                icon: MessageCircle,
              },
              {
                step: "03",
                title: "Give feedback",
                description: "React, share what works, and help Logan learn what matters most to you.",
                icon: Sparkles,
              },
            ].map(({ step, title, description, icon: Icon }) => (
              <div 
                key={step}
                className="relative p-6 rounded-2xl bg-card border border-border/50 shadow-card group hover:shadow-glow transition-shadow"
              >
                <div className="absolute -top-3 -left-3 w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-primary-foreground text-sm font-bold">
                  {step}
                </div>
                <div className="pt-4">
                  <Icon className="w-8 h-8 text-primary mb-4" />
                  <h3 className="font-display font-semibold text-lg mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pilot Details */}
      <section className="py-20 px-4 bg-secondary/30">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-card rounded-2xl p-8 md:p-12 border border-border/50 shadow-card">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-2xl font-display font-bold mb-4">Pilot Details</h2>
                <ul className="space-y-3">
                  {[
                    "4 weeks of personalized insights",
                    "Messages on Saturday & Tuesday nights (Israel time)",
                    "Direct WhatsApp from Logan (+14155238886)",
                    "AI-powered, human-approved content",
                    "Your feedback shapes the experience",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ArrowRight className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5">
                  <p className="text-sm text-muted-foreground mb-2">Insights from</p>
                  <p className="text-2xl font-display font-bold text-primary">+1 415 523 8886</p>
                  <p className="text-sm text-muted-foreground mt-2">Save this number as "Logan" 💕</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border/50">
        <div className="container mx-auto max-w-4xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full gradient-hero flex items-center justify-center">
              <Heart className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-display font-medium">Logan</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Made with 💕 for women everywhere
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
