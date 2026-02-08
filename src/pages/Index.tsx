import { Link } from "react-router-dom";
import { Brain, Zap, Target, ArrowRight, TrendingUp, Shield, Calendar } from "lucide-react";
import { LoganLogo } from "@/components/LoganLogo";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" showGlow={false} />
            <span className="font-display font-semibold text-lg text-foreground">Logan</span>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            Already a member? Sign in
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 relative overflow-hidden">
        {/* Background gradient effect */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-[120px]" />
        </div>

        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Hero Content */}
            <div className="space-y-6 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                <Brain className="w-4 h-4" />
                <span>Intelligent Cycle Guidance</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight text-foreground">
                Not just data.{" "}
                <span className="text-primary">Strategy.</span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-lg">
                Logan transforms cycle tracking into intelligent decision support. 
                It learns your unique patterns, anticipates what's coming, and delivers 
                proactive, hyper-personalized insights you can act on.
              </p>

              <div className="flex flex-wrap gap-6 pt-4">
                {[
                  { icon: Target, text: "Direction, not just awareness" },
                  { icon: Zap, text: "Proactive guidance" },
                  { icon: TrendingUp, text: "Performance optimization" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="w-4 h-4 text-primary" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right - CTA Card */}
            <div className="lg:pl-8">
              <div className="bg-card rounded-2xl p-6 md:p-8 shadow-card border border-border max-w-md mx-auto">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-display font-semibold mb-2 text-foreground">Join the Pilot</h2>
                  <p className="text-sm text-muted-foreground">
                    Get early access to intelligent cycle guidance
                  </p>
                </div>
                <div className="space-y-4">
                  <Link to="/auth">
                    <Button className="w-full" size="lg">
                      Get Started
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <p className="text-xs text-center text-muted-foreground">
                    Create your account and start your personalized journey
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Statement */}
      <section className="py-16 px-4 border-y border-border bg-muted/30">
        <div className="container mx-auto max-w-3xl text-center">
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
            For too long, women have tracked their cycles without truly using them. 
            Logging symptoms. Watching dates. Collecting data.{" "}
            <span className="text-foreground font-medium">But not getting real guidance on what to do with it.</span>
          </p>
        </div>
      </section>

      {/* What Logan Does */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-4 text-foreground">Plan Smarter Around Your Cycle</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From energy and focus to training, work, relationships, and recovery. 
              Logan helps you plan smarter instead of fighting your biology.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "When to push",
                description: "Identify your peak performance windows for challenging work and intense training.",
                icon: Zap,
              },
              {
                title: "When to protect",
                description: "Know when to schedule important meetings, presentations, or difficult conversations.",
                icon: Shield,
              },
              {
                title: "When to rest",
                description: "Recognize recovery phases and build in the restoration your body needs.",
                icon: Calendar,
              },
              {
                title: "When to adapt",
                description: "Adjust communication, workload, and training based on where you are in your cycle.",
                icon: Target,
              },
            ].map(({ title, description, icon: Icon }) => (
              <div 
                key={title}
                className="p-6 rounded-2xl bg-card border border-border shadow-card group hover:shadow-glow transition-all hover:border-primary/30"
              >
                <Icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-display font-semibold text-lg mb-2 text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-4 text-foreground">How Logan Works</h2>
            <p className="text-muted-foreground">Intelligent. Proactive. Personal.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Share your patterns",
                description: "Tell Logan about your cycle through natural conversation. No complex forms or tracking required.",
                icon: Brain,
              },
              {
                step: "02",
                title: "Receive proactive insights",
                description: "Get personalized guidance that anticipates what's coming and helps you prepare.",
                icon: Zap,
              },
              {
                step: "03",
                title: "Act with confidence",
                description: "Make smarter decisions about training, work, and life based on your unique biology.",
                icon: Target,
              },
            ].map(({ step, title, description, icon: Icon }) => (
              <div 
                key={step}
                className="relative p-6 rounded-2xl bg-card border border-border shadow-card group hover:shadow-glow transition-all hover:border-primary/30"
              >
                <div className="absolute -top-3 -left-3 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                  {step}
                </div>
                <div className="pt-4">
                  <Icon className="w-8 h-8 text-primary mb-4" />
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pilot Details */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-card rounded-2xl p-8 md:p-12 border border-border shadow-card">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-2xl font-display font-bold mb-4 text-foreground">Pilot Program</h2>
                <ul className="space-y-3">
                  {[
                    "4 weeks of intelligent cycle guidance",
                    "Proactive insights delivered through chat",
                    "Learn your unique patterns and timing",
                    "Your feedback shapes the experience",
                    "Natural conversation, not complex tracking",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ArrowRight className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center p-8 rounded-2xl bg-muted/50 border border-border">
                  <p className="text-sm text-muted-foreground mb-2">This isn't passive tracking</p>
                  <p className="text-xl font-display font-bold text-primary leading-snug">
                    Intelligent performance guidance
                  </p>
                  <p className="text-sm text-muted-foreground mt-3">
                    For women who want to live, work, and train in sync with their biology
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto max-w-4xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" showGlow={false} />
            <span className="font-display font-medium text-foreground">Logan</span>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <Link 
              to="/consent" 
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Consent & Privacy Policy
            </Link>
            <p className="text-sm text-muted-foreground">
              Made by women for women everywhere
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
