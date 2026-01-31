import { Link } from "react-router-dom";
import { OnboardingForm } from "@/components/OnboardingForm";
import { MessageCircle, Sparkles, Calendar, ArrowRight, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoganLogo } from "@/components/LoganLogo";

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
          {/* Admin access hidden - use /logan-admin-access */}
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
                <Sparkles className="w-4 h-4" />
                <span>4-Week Pilot Program</span>
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight text-foreground">
                Meet <span className="text-primary">Logan</span>, your{" "}
                <span className="text-primary">cycle companion</span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-lg">
                Hyper-personalized insights and suggestions delivered directly 
                to your Telegram. Because your cycle deserves 
                attention, not guesswork.
              </p>

              <div className="flex flex-wrap gap-6 pt-4">
                {[
                  { icon: MessageCircle, text: "Telegram insights" },
                  { icon: Bot, text: "AI-powered" },
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
              <div className="bg-card rounded-2xl p-6 md:p-8 shadow-card border border-border max-w-md mx-auto">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-display font-semibold mb-2 text-foreground">Join the Pilot</h2>
                  <p className="text-sm text-muted-foreground">
                    Get early access to Logan's personalized insights
                  </p>
                </div>
                <OnboardingForm />
                <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
                  By continuing, you agree to the Pilot Consent & Privacy Terms (shown during sign-up). 
                  This program provides educational information only and is not medical advice. 
                  By interacting with this program you consent you are 18+ years old.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold mb-4 text-foreground">How Logan Works</h2>
            <p className="text-muted-foreground">Simple, personal, powerful</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Share your info",
                description: "Tell Logan about your cycle, symptoms, and goals. Takes less than 2 minutes.",
                icon: Bot,
              },
              {
                step: "02",
                title: "Receive insights",
                description: "Get personalized insights and recommendations via Telegram on Saturdays and Tuesdays.",
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
                <h2 className="text-2xl font-display font-bold mb-4 text-foreground">Pilot Details</h2>
                <ul className="space-y-3">
                  {[
                    "4 weeks of personalized insights",
                    "Messages on Saturday & Tuesday nights (Israel time)",
                    "Telegram delivery via @AskLoganBot",
                    "AI-assisted educational insights, reviewed by humans",
                    "Your feedback shapes the experience",
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
                  <p className="text-sm text-muted-foreground mb-2">Connect with Logan on Telegram</p>
                  <p className="text-2xl font-display font-bold text-primary">@AskLoganBot</p>
                  <p className="text-sm text-muted-foreground mt-2">You'll connect during sign-up</p>
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
          <p className="text-sm text-muted-foreground">
            Made by women for women everywhere
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
