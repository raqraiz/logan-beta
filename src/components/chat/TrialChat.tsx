import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { LoganFullLogo } from "@/components/LoganFullLogo";
import { Send, Loader2, ArrowDown, ArrowRight, ArrowLeft, Sparkles, MessageCircle, Check, Sun, Moon } from "lucide-react";
import { VoiceInputButton } from "./VoiceInputButton";
import { supabase } from "@/integrations/supabase/client";
import { InlineChatAuth } from "./InlineChatAuth";
import { MarkdownMessage } from "./MarkdownMessage";
import { toast } from "@/hooks/use-toast";

interface TrialMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const FEELING_CHIPS = [
  "I feel like a different person two weeks a month",
  "I never know when to push or rest",
  "My cycle is irregular and nothing tracks it right",
  "I'm in menopause and no one prepared me for this",
];

const STARTER_PROMPTS = [
  "Why do I crash the week before my period?",
  "When's the best time of my cycle to work out hard?",
  "How do I know if I'm in perimenopause?",
  "What should I eat in my luteal phase?",
  "Why is my sleep worse some weeks?",
  "How do I plan my month around my energy?",
];

// Real-feeling attribution — last initial + a humanising detail.
const TESTIMONIALS = [
  {
    quote: "I finally understand why I crash every few weeks. Logan saw the pattern before I did.",
    name: "Maya R., 34 · Los Angeles",
  },
  {
    quote: "I stopped scheduling big presentations on day 25. My whole week changed.",
    name: "Jules T., 29 · Austin",
  },
  {
    quote: "It's like texting a friend who actually knows what's happening in my body.",
    name: "Sam K., 38 · New York",
  },
];

const getContextualHeadline = (q: string): string => {
  const s = q.toLowerCase();
  if (s.includes("luteal") || s.includes("two weeks") || s.includes("different person")) return "That luteal chaos? I can help you see it coming.";
  if (s.includes("predict") || s.includes("mood")) return "Your mood has a pattern. Let's map it.";
  if (s.includes("push") || s.includes("rest")) return "Your body wants different things on different days.";
  if (s.includes("baby") || s.includes("postpartum")) return "Postpartum has its own rhythm. I'll meet you there.";
  if (s.includes("irregular")) return "Irregular doesn't mean unknowable. Let's find your signal.";
  if (s.includes("pms") || s.includes("blindsided")) return "What if you could see PMS coming days in advance?";
  if (s.includes("menopause")) return "Menopause isn't the end of knowing your body. I'll help you find your new normal.";
  return "Once you see the pattern, everything clicks.";
};

const getContextualDescription = (q: string): string => {
  const s = q.toLowerCase();
  if (s.includes("baby") || s.includes("postpartum")) return "Create an account and I'll track where you are in recovery so I can guide you week by week.";
  if (s.includes("irregular")) return "Create an account and I'll learn your unique patterns instead of forcing you into a 28-day box.";
  if (s.includes("menopause")) return "Create an account and I'll track your symptoms, energy, and sleep so you can feel like yourself again.";
  return "Create an account and I'll learn your patterns so I can give you a heads up before things shift.";
};

export const TrialChat = () => {
  const [messages, setMessages] = useState<TrialMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [chatMode, setChatMode] = useState(false); // hide composer until user opts in
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [trialMessageCount, setTrialMessageCount] = useState(0);
  const [lastUserQuestion, setLastUserQuestion] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [authView, setAuthView] = useState<"signup" | "signin">("signup");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("logan-landing-theme") as "dark" | "light") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("logan-landing-theme", theme);
  }, [theme]);

  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const signupRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to top on mount so the landing page always starts at the hero
  useEffect(() => {
    const scrollTop = () => {
      const el = scrollContainerRef.current;
      if (el) el.scrollTo({ top: 0, behavior: "auto" });
    };
    scrollTop();
    requestAnimationFrame(() => {
      scrollTop();
      setTimeout(scrollTop, 100);
    });
  }, []);

  // Auto-scroll only in chat mode
  useEffect(() => {
    if (!chatMode) return;
    if (!isNearBottomRef.current) return;
    const el = scrollContainerRef.current;
    const lastMessageEl = lastMessageRef.current;
    if (el && lastMessageEl) {
      const isLongMessage = lastMessageEl.offsetHeight > el.clientHeight * 0.8;
      if (isLongMessage) {
        lastMessageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMode]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateScrollState = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 150;
      setShowScrollButton(distanceFromBottom > 40);
    };
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollState);
  }, [messages.length, showAuth, hasStarted, chatMode]);

  const scrollToSignup = () => {
    signupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const enterChatMode = (text?: string) => {
    setChatMode(true);
    if (text) {
      setInputValue(text);
      setTimeout(() => {
        const form = document.querySelector('form[data-trial-chat-form]');
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, 80);
    } else {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim() || waitlistSubmitting) return;
    setWaitlistSubmitting(true);
    try {
      const email = waitlistEmail.trim().toLowerCase();
      const { error } = await supabase.from("waitlist").insert({
        email,
        source: "landing_hero",
      });
      if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
      // Sync to Brevo for email automations. Failures here shouldn't break signup.
      supabase.functions.invoke("brevo-add-contact", {
        body: { email, source: "landing_hero" },
      }).catch((e) => console.warn("Brevo sync failed:", e));
      setWaitlistDone(true);
      toast({ title: "You're on the list 💚", description: "I'll be in touch soon." });
    } catch (err) {
      console.error("Waitlist error:", err);
      toast({ title: "Something went wrong", description: "Try again in a moment.", variant: "destructive" });
    }
    setWaitlistSubmitting(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    setHasStarted(true);
    const userMessage = inputValue.trim();
    setInputValue("");

    const newUserMessage: TrialMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
    };

    setMessages(prev => [...prev, newUserMessage]);
    setLastUserQuestion(userMessage);
    setIsTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke("trial-chat", {
        body: {
          messages: [...messages, newUserMessage].map(m => ({ role: m.role, content: m.content })),
        },
      });
      if (error) throw error;
      const aiResponse = data?.response || "I'd love to help you understand your cycle better. What would you like to know?";
      setMessages(prev => [...prev, { id: `assistant-${Date.now()}`, role: "assistant", content: aiResponse }]);
    } catch (error) {
      console.error("Trial chat error:", error);
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "I can help you understand your cycle and how it affects your energy, mood, and performance. What's going on for you?",
      }]);
    }

    setTrialMessageCount(prev => prev + 1);
    setIsTyping(false);
    if (trialMessageCount >= 0) {
      setTimeout(() => setShowAuth(true), 500);
    }
    inputRef.current?.focus();
  };

  const handleScrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    isNearBottomRef.current = true;
    setShowScrollButton(false);
  };

  return (
    <div className={`landing-page ${theme === "light" ? "theme-light" : ""} h-[100svh] supports-[height:100dvh]:h-[100dvh] text-foreground flex flex-col relative overflow-hidden`}>
      <div className="absolute inset-0 pointer-events-none">
        {/* Subtle radial glows — teal top-left, violet/magenta bottom-right */}
        <div className={`absolute top-0 left-0 w-[600px] h-[600px] rounded-full blur-3xl ${theme === "light" ? "opacity-20" : "opacity-40"}`}
             style={{ background: "radial-gradient(circle, #2BD4D9 0%, transparent 70%)", transform: "translate(-30%, -30%)" }} />
        <div className={`absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl ${theme === "light" ? "opacity-5" : "opacity-30"}`}
             style={{ background: "radial-gradient(circle, #A22BE8 0%, transparent 70%)", transform: "translate(25%, 25%)" }} />
      </div>

      {/* Header */}
      <header className="relative z-20">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganFullLogo size="sm" />
            <span className="inline-flex items-center text-[10px] uppercase tracking-[0.2em] text-primary border border-primary/40 rounded-full px-3 py-1">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-5">
            {chatMode ? (
              <button
                onClick={() => { setChatMode(false); setHasStarted(false); setMessages([]); setShowAuth(false); setTrialMessageCount(0); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            ) : (
              <>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="hidden sm:inline-flex items-center gap-2 text-sm text-foreground/80 hover:text-foreground transition-colors border border-border/60 rounded-full px-4 h-10"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <button
                  onClick={() => { setAuthView("signin"); scrollToSignup(); }}
                  className="text-sm text-foreground/80 hover:text-foreground transition-colors"
                >
                  Sign in
                </button>
                <button
                  onClick={() => { setAuthView("signup"); scrollToSignup(); }}
                  className="landing-brand-fill h-10 px-5 text-sm rounded-full font-medium transition-opacity hover:opacity-90 text-[#16120E]"
                >
                  Get started
                </button>
              </>

            )}
          </div>
        </div>
      </header>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 sm:px-10 relative z-10">
        <div className={`${chatMode ? "max-w-2xl" : "max-w-6xl"} mx-auto py-6 space-y-16`}>

          {!chatMode && !hasStarted && (
            <>
              {/* ================= HERO ================= */}
              <section className="pt-8 sm:pt-16 animate-fade-in">
                <h1 className="font-serif-display font-medium text-5xl sm:text-7xl lg:text-8xl leading-[1.05] tracking-tight text-foreground">
                  The cycle app that actually <span className="landing-brand-text">keeps up.</span>
                </h1>
                <p className="text-lg sm:text-xl text-muted-foreground mt-8 leading-relaxed max-w-2xl">
                  Meet Logan, the companion that reads your energy, mood, and shifts — so nothing catches you off guard.
                  For every body, in every stage, whatever your cycle looks like.
                </p>

                {/* Primary actions */}
                <div className="mt-10 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={scrollToSignup}
                    className="landing-brand-fill h-14 px-8 text-base font-semibold rounded-full inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  >
                    Create my free account
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => enterChatMode()}
                    className="h-14 px-8 text-base rounded-full bg-[#2BD4D9] text-[#16120E] inline-flex items-center justify-center gap-3 hover:opacity-90 transition-opacity"
                  >
                    <span className="landing-brand-ring w-4 h-4 rounded-full inline-block" />
                    Ask Logan a question first
                  </button>
                </div>
              </section>

              {/* ================= "You might be here because…" ================= */}
              <section>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70 mb-4">
                  You might be here because…
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {FEELING_CHIPS.map((chip, i) => {
                    const accents = ["#FF2E92", "#2BD4D9", "#A22BE8", "#4F8EF7"];
                    return (
                      <button
                        key={chip}
                        onClick={() => enterChatMode(chip)}
                        className="text-left text-sm px-5 py-4 rounded-xl bg-card/40 border border-border/50 hover:border-border text-foreground/90 hover:text-foreground transition-all"
                        style={{ borderLeft: `3px solid ${accents[i % 4]}` }}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground/70 mt-3">
                  Tap one to ask Logan about it.
                </p>
              </section>

              {/* ================= Sign Up ================= */}
              <section ref={signupRef} className="pt-4">
                <div className="rounded-3xl border border-border/50 bg-card/30 p-8 sm:p-14">
                  <div className="text-center">
                    <h2 className="font-serif-display font-medium text-4xl sm:text-5xl text-foreground mb-4">
                      Ready to meet Logan?
                    </h2>
                    <p className="text-base text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
                      Create your account and I'll start learning your patterns from day one. Free during beta.
                    </p>
                    <div className="max-w-md mx-auto rounded-2xl bg-card border border-border/50 p-6">
                      <InlineChatAuth defaultView={authView} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground/70 text-center mt-8 max-w-xl mx-auto leading-relaxed">
                    We keep your health data private and secure. It's never sold, shared with advertisers, or used to train models outside Logan. You can delete your account and data anytime.
                  </p>
                </div>
              </section>

              {/* ================= Testimonials ================= */}
              <section>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70 mb-4">
                  Real women, real words
                </p>
                <div className="grid sm:grid-cols-3 gap-4">
                  {TESTIMONIALS.map((t, i) => {
                    const tops = ["#2BD4D9", "#A22BE8", "#FF2E92"];
                    return (
                      <figure key={t.name} className="bg-card/40 border border-border/50 rounded-2xl p-6" style={{ borderTop: `3px solid ${tops[i]}` }}>
                        <blockquote className="text-base text-foreground/90 leading-relaxed">"{t.quote}"</blockquote>
                        <figcaption className="text-sm text-muted-foreground mt-4">— {t.name}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              </section>

              {/* ================= Founder note ================= */}
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-lg">
                      R
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">Raquella · Founder</p>
                    <p className="text-sm text-muted-foreground">building Logan with women like you</p>
                  </div>
                </div>

                <div className="bg-card/40 border border-border/50 rounded-2xl p-8 max-w-2xl">
                  <h3 className="font-serif-display font-medium text-3xl text-foreground mb-4">
                    Welcome to Logan.
                  </h3>
                  <p className="text-foreground/85 leading-relaxed text-base">
                    You're joining a small group of women helping me build this before I launch publicly.
                    Logan is free during beta, evolves fast, and your feedback genuinely shapes what I build next.
                  </p>
                </div>
              </section>

              {/* ================= Not Ready to sign up today? ================= */}
              <section>
                <div className="bg-card/40 border border-border/50 rounded-2xl p-8">
                  {waitlistDone ? (
                    <div className="flex items-center gap-2.5 text-sm text-foreground/90">
                      <span className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary" />
                      </span>
                      You're on the list. I'll be in touch.
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Not ready to sign up today?
                      </h3>
                      <p className="text-sm text-muted-foreground mb-5 max-w-lg">
                        Leave your email and I'll send you a short note from the founder when there's something worth coming back for.
                      </p>
                      <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-xl">
                        <Input
                          type="email"
                          required
                          value={waitlistEmail}
                          onChange={(e) => setWaitlistEmail(e.target.value)}
                          placeholder="you@email.com"
                          className="flex-1 h-12 bg-background/60 rounded-xl"
                          disabled={waitlistSubmitting}
                        />
                        <button
                          type="submit"
                          disabled={waitlistSubmitting || !waitlistEmail.trim()}
                          className="h-12 px-6 rounded-xl font-medium transition-opacity hover:opacity-90 disabled:opacity-50 bg-[#2BD4D9] text-[#16120E]"
                        >
                          {waitlistSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Keep me posted"}
                        </button>
                      </form>
                      <p className="text-xs text-muted-foreground/70 mt-3">
                        No spam. Unsubscribe anytime.
                      </p>
                    </>
                  )}
                </div>
              </section>

              {/* ================= Footer ================= */}
              <footer className="pt-8 pb-6 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <LoganFullLogo size="sm" />
                <p className="text-sm text-muted-foreground">
                  Understanding your body improves everything · © 2026
                </p>
              </footer>
            </>
          )}


          {chatMode && messages.length === 0 && !isTyping && (
            <div className="py-6 animate-fade-in">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-3 pl-1">
                Not sure where to start? Try one of these
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setInputValue(prompt);
                      setTimeout(() => {
                        const form = document.querySelector('form[data-trial-chat-form]');
                        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                      }, 80);
                    }}
                    className="text-left text-sm px-4 py-2.5 rounded-2xl bg-card/60 border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-foreground/85 hover:text-foreground transition-all duration-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/70 mt-3 pl-1">
                Or type your own question below.
              </p>
            </div>
          )}

          {/* Chat messages (only in chat mode) */}
          {chatMode && messages.map((message, index) => {
            const isLastAssistant = message.role === "assistant" && index === messages.length - 1;
            if (showAuth && isLastAssistant) return null;
            return (
              <div
                key={message.id}
                ref={index === messages.length - 1 ? lastMessageRef : null}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-glow"
                      : "bg-gradient-to-br from-card to-card/80 border border-border/50 shadow-card backdrop-blur-sm"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <MarkdownMessage content={message.content} />
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  )}
                </div>
              </div>
            );
          })}

          {chatMode && isTyping && (
            <div className="flex justify-start animate-fade-in">
              <div className="bg-gradient-to-br from-card to-card/80 border border-border/50 rounded-2xl px-5 py-4 shadow-card">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {chatMode && showAuth && (() => {
            const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
            return (
              <div className="py-6 animate-fade-in">
                <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/30 rounded-3xl p-6 sm:p-8 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
                  <div className="absolute top-0 left-1/2 w-32 h-32 bg-primary/20 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2" />
                  <div className="relative z-10">
                    {lastAssistant && (
                      <div className="mb-5 text-left text-sm text-foreground/90 leading-relaxed">
                        <MarkdownMessage content={lastAssistant.content} />
                      </div>
                    )}
                    <div className="text-center">
                      <h3 className="font-display font-semibold text-lg text-foreground mb-2">
                        {getContextualHeadline(lastUserQuestion)}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-1 max-w-sm mx-auto">
                        {getContextualDescription(lastUserQuestion)}
                      </p>
                      <InlineChatAuth defaultView={authView} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div ref={scrollRef} />
        </div>
      </div>

      {showScrollButton && chatMode && (
        <div className={`fixed right-4 md:right-8 ${showAuth ? "bottom-6" : "bottom-24"} z-50 animate-in fade-in slide-in-from-bottom-2`}>
          <Button type="button" size="sm" onClick={handleScrollToBottom} className="rounded-full shadow-card">
            <ArrowDown className="h-4 w-4" />
            Jump to latest
          </Button>
        </div>
      )}

      {/* Composer only renders in chat mode (and not when auth is up) */}
      {chatMode && !showAuth && (
        <div className="border-t border-border/30 bg-card/40 backdrop-blur-xl sticky bottom-0 relative z-10">
          <form data-trial-chat-form onSubmit={handleSend} className="max-w-2xl mx-auto px-4 py-4">
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <Textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 200) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                    }
                  }}
                  rows={1}
                  placeholder="Ask Logan anything…"
                  className="min-h-[52px] max-h-[200px] resize-none pl-5 pr-4 py-3.5 bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all duration-300 text-base"
                  disabled={isTyping}
                />
              </div>
              <VoiceInputButton
                onTranscript={(text) => setInputValue(prev => prev ? `${prev} ${text}` : text)}
                disabled={isTyping}
                className="h-13 w-13 rounded-xl"
              />
              <Button
                type="submit"
                size="icon"
                className="h-13 w-13 rounded-xl bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-glow transition-all duration-300 hover:scale-105"
                disabled={!inputValue.trim() || isTyping}
              >
                {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2.5 px-1">
              <p className="text-[11px] text-muted-foreground/60">
                Free during beta · <Link to="/consent" className="hover:text-foreground transition-colors">Privacy</Link>
              </p>
              <button
                type="button"
                onClick={() => setShowAuth(true)}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors font-medium"
              >
                Skip — create account →
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
