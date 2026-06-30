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
    <div className="h-[100svh] supports-[height:100dvh]:h-[100dvh] bg-background flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl transform translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-1/3 left-0 w-96 h-96 bg-primary/[0.06] rounded-full blur-3xl transform -translate-x-1/3" />
        {/* Home-page widget color echoes — prominent ambient blobs */}
        <div className="absolute top-1/4 left-[10%] w-80 h-80 bg-phase-follicular/15 rounded-full blur-3xl" />
        <div className="absolute top-[40%] right-[15%] w-72 h-72 bg-phase-ovulation/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-[20%] w-96 h-96 bg-phase-menstruation/12 rounded-full blur-3xl" />
        <div className="absolute top-[70%] left-[20%] w-64 h-64 bg-phase-luteal/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-primary/12 rounded-full blur-3xl transform translate-x-1/4 translate-y-1/4" />
      </div>

      {/* Header */}
      <header className="border-b border-border/30 bg-card/30 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganFullLogo size="sm" />
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
              <Sparkles className="w-2.5 h-2.5" /> Beta
            </span>
          </div>
          <div className="flex items-center gap-3">
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
                  onClick={() => { setAuthView("signin"); scrollToSignup(); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign in
                </button>
                <Button size="sm" onClick={() => { setAuthView("signup"); scrollToSignup(); }} className="h-9 px-4 text-sm">
                  Get started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 relative z-10">
        <div className="max-w-2xl mx-auto py-8 space-y-10">

          {!chatMode && !hasStarted && (
            <>
              {/* ================= HERO — above the fold ================= */}
              <section className="pt-12 sm:pt-20 animate-fade-in">
                {/* Phase color dots — home tab echo */}
                <div className="flex items-center gap-2 mb-6">
                  <span className="w-2.5 h-2.5 rounded-full bg-phase-menstruation" />
                  <span className="w-2.5 h-2.5 rounded-full bg-phase-follicular" />
                  <span className="w-2.5 h-2.5 rounded-full bg-phase-ovulation" />
                  <span className="w-2.5 h-2.5 rounded-full bg-phase-luteal" />
                  <span className="text-[10px] uppercase tracking-widest text-primary/90 bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1 ml-1">
                    <Sparkles className="w-2.5 h-2.5 inline-block mr-1" /> Private beta
                  </span>
                </div>
                <h1 className="font-display font-semibold text-3xl sm:text-5xl leading-[1.12] tracking-tight text-foreground">
                  The cycle app that actually <span className="text-primary">keeps up.</span>
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground mt-6 leading-relaxed max-w-xl">
                  Meet Logan, the AI companion that predicts your energy, mood, and shifts — so nothing catches you off guard.
                  For every body, in every stage, whatever your cycle looks like.
                </p>

                {/* Primary actions */}
                <div className="mt-10 flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={scrollToSignup} className="h-12 px-6 text-base">
                    Create my free account
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => enterChatMode()}
                    className="h-12 px-6 text-base border-border/60 hover:border-primary/50 hover:bg-primary/5"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Ask Logan a question first
                  </Button>
                </div>
              </section>

              {/* ================= "You might be here because…" ================= */}
              <section>
                <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-3 pl-1">
                  You might be here because…
                </p>
                <div className="flex flex-wrap gap-2">
                  {FEELING_CHIPS.map((chip, i) => {
                    const colors = [
                      "border-l-phase-menstruation hover:border-l-phase-menstruation",
                      "border-l-phase-follicular hover:border-l-phase-follicular",
                      "border-l-phase-ovulation hover:border-l-phase-ovulation",
                      "border-l-phase-luteal hover:border-l-phase-luteal",
                    ];
                    return (
                      <button
                        key={chip}
                        onClick={() => enterChatMode(chip)}
                        className={`text-left text-sm px-4 py-2.5 rounded-2xl bg-card/60 border border-border/60 ${colors[i % 4]} border-l-[3px] hover:border-primary/50 hover:bg-primary/5 text-foreground/85 hover:text-foreground transition-all duration-200 backdrop-blur-sm`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground/70 mt-3 pl-1">
                  Tap one to ask Logan about it.
                </p>
              </section>

              {/* ================= Sign Up ================= */}
              <section ref={signupRef} className="pt-2">
                <div className="relative bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border border-primary/30 rounded-3xl p-6 sm:p-8 overflow-hidden">
                  <div className="absolute top-0 left-1/2 w-32 h-32 bg-primary/20 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
                  <div className="relative z-10 text-center">
                    <h2 className="font-display font-semibold text-2xl text-foreground mb-2">
                      Ready to meet Logan?
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      Create your account and I'll start learning your patterns from day one. Free during beta.
                    </p>
                    <InlineChatAuth defaultView={authView} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/60 text-center mt-5 max-w-md mx-auto leading-relaxed">
                  We keep your health data private and secure. It's never sold, shared with advertisers, or used to train AI models outside Logan. You can delete your account and data anytime.
                </p>
              </section>

              {/* ================= Testimonials ================= */}
              <section>
                <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-3 pl-1">
                  Real women, real words
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {TESTIMONIALS.map((t, i) => {
                    const tops = [
                      "border-t-phase-follicular",
                      "border-t-phase-ovulation",
                      "border-t-phase-luteal",
                    ];
                    return (
                      <figure key={t.name} className={`bg-card/40 border border-border/40 ${tops[i]} border-t-[3px] rounded-2xl p-4 backdrop-blur-sm`}>
                        <blockquote className="text-sm text-foreground/85 leading-relaxed">"{t.quote}"</blockquote>
                        <figcaption className="text-xs text-muted-foreground mt-2">— {t.name}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              </section>

              {/* ================= DM from founder ================= */}
              <section className="space-y-5 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-display font-semibold text-base shadow-glow">
                      R
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-background" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Raquella · Founder</p>
                    <p className="text-xs text-muted-foreground">building Logan with women like you</p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-card to-card/70 border border-border/50 rounded-2xl rounded-tl-sm px-5 py-4 shadow-card backdrop-blur-sm max-w-[92%]">
                  <p className="text-foreground/95 leading-relaxed">
                    Welcome to Logan <span className="text-primary">💚</span>
                  </p>
                  <p className="text-foreground/85 leading-relaxed mt-2 text-[15px]">
                    You're joining a small group of women helping me build this before I launch publicly.
                    Logan is free during beta, evolves fast, and your feedback genuinely shapes what I build next.
                  </p>
                </div>
              </section>

              {/* ================= Not Ready to sign up today? ================= */}
              <section>
                <div className="bg-card/40 border border-border/40 rounded-2xl p-4 max-w-md">
                  {waitlistDone ? (
                    <div className="flex items-center gap-2.5 text-sm text-foreground/90">
                      <span className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary" />
                      </span>
                      You're on the list. I'll be in touch.
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-foreground/85 mb-1">
                        Not ready to sign up today?
                      </p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Leave your email and I'll send you a short note from the founder when there's something worth coming back for.
                      </p>
                      <form onSubmit={handleWaitlist} className="flex gap-2">
                        <Input
                          type="email"
                          required
                          value={waitlistEmail}
                          onChange={(e) => setWaitlistEmail(e.target.value)}
                          placeholder="you@email.com"
                          className="flex-1 h-11 bg-background/60"
                          disabled={waitlistSubmitting}
                        />
                        <Button type="submit" disabled={waitlistSubmitting || !waitlistEmail.trim()} className="h-11 px-4">
                          {waitlistSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Keep me posted"}
                        </Button>
                      </form>
                      <p className="text-[11px] text-muted-foreground/70 mt-2">
                        No spam. Unsubscribe anytime.
                      </p>
                    </>
                  )}
                </div>
              </section>
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
