import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoganFullLogo } from "@/components/LoganFullLogo";
import { Send, Loader2, ArrowDown, ArrowRight, Sparkles, MessageCircle, Check } from "lucide-react";
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
  "I can't predict my mood anymore",
  "I never know when to push or rest",
  "I just had a baby and don't recognize myself",
  "My cycle is irregular and nothing tracks it right",
  "I want to stop being blindsided by PMS",
];

// Real-feeling attribution — last initial + a humanising detail.
const TESTIMONIALS = [
  {
    quote: "I finally understand why I cry every third Tuesday. Logan saw the pattern before I did.",
    name: "Maya R., 34 · London",
  },
  {
    quote: "Postpartum me was lost. This is the first thing that doesn't assume I'm still cycling normally.",
    name: "Priya S., 31 · mum of two",
  },
  {
    quote: "I stopped scheduling hard meetings on day 25. My whole week changed.",
    name: "Jules T., 29 · product lead",
  },
  {
    quote: "It's like texting a friend who actually knows what's happening in my body.",
    name: "Sam K., 38 · marathon runner",
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
  return "Once you see the pattern, everything clicks.";
};

const getContextualDescription = (q: string): string => {
  const s = q.toLowerCase();
  if (s.includes("baby") || s.includes("postpartum")) return "Create an account and I'll track where you are in recovery so I can guide you week by week.";
  if (s.includes("irregular")) return "Create an account and I'll learn your unique patterns instead of forcing you into a 28-day box.";
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

  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const signupRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    const lastMessageEl = lastMessageRef.current;
    if (viewport && lastMessageEl) {
      const isLongMessage = lastMessageEl.offsetHeight > viewport.clientHeight * 0.8;
      if (isLongMessage) {
        lastMessageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    if (!viewport) return;
    const updateScrollState = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 150;
      setShowScrollButton(distanceFromBottom > 40);
    };
    updateScrollState();
    viewport.addEventListener("scroll", updateScrollState, { passive: true });
    return () => viewport.removeEventListener("scroll", updateScrollState);
  }, [messages.length, showAuth, hasStarted, chatMode]);

  const scrollToSignup = () => {
    const viewport = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    signupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // fallback
    setTimeout(() => {
      if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }, 50);
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
      const { error } = await supabase.from("waitlist").insert({
        email: waitlistEmail.trim().toLowerCase(),
        source: "landing_hero",
      });
      if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
      setWaitlistDone(true);
      toast({ title: "You're on the list 💚", description: "I'll be in touch soon with your invite." });
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
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-1/3 left-0 w-72 h-72 bg-primary/[0.03] rounded-full blur-3xl transform -translate-x-1/2" />
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
            <button
              onClick={() => setShowAuth(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </button>
            <Button size="sm" onClick={scrollToSignup} className="h-9 px-4 text-sm">
              Get started
            </Button>
          </div>
        </div>
      </header>

      <ScrollArea ref={scrollContainerRef} className="flex-1 px-4 relative z-10">
        <div className="max-w-2xl mx-auto py-8 space-y-10">

          {!chatMode && !hasStarted && (
            <>
              {/* ================= HERO — above the fold ================= */}
              <section className="pt-4 sm:pt-8 animate-fade-in">
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-primary/90 bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1 mb-5">
                  <Sparkles className="w-2.5 h-2.5" /> Private beta · free for now
                </span>
                <h1 className="font-display font-semibold text-3xl sm:text-5xl leading-[1.05] tracking-tight text-foreground">
                  The AI that finally <span className="text-primary">gets your body.</span>
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground mt-4 leading-relaxed max-w-xl">
                  Logan predicts what's coming — your energy, mood, and PMS — and tells you what to <em>do</em> about it.
                  Built for irregular cycles, postpartum, the pill, perimenopause. Whatever's true for you.
                </p>

                {/* Primary actions */}
                <div className="mt-7 flex flex-col sm:flex-row gap-3">
                  <Button size="lg" onClick={scrollToSignup} className="h-12 px-6 text-base">
                    Get my free invite
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

                {/* Soft email capture — lower friction than full signup */}
                <div className="mt-8 bg-card/40 border border-border/40 rounded-2xl p-4 backdrop-blur-sm max-w-md">
                  {waitlistDone ? (
                    <div className="flex items-center gap-2.5 text-sm text-foreground/90">
                      <span className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary" />
                      </span>
                      You're on the list. Watch your inbox for your invite.
                    </div>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-2">
                        Not ready yet? Get early access by email
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
                          {waitlistSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
                        </Button>
                      </form>
                      <p className="text-[11px] text-muted-foreground/70 mt-2">
                        One email when your invite is ready. No spam, ever.
                      </p>
                    </>
                  )}
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

              {/* ================= "You might be here because…" ================= */}
              <section>
                <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-3 pl-1">
                  You might be here because…
                </p>
                <div className="flex flex-wrap gap-2">
                  {FEELING_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => enterChatMode(chip)}
                      className="text-left text-sm px-4 py-2.5 rounded-2xl bg-card/60 border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-foreground/85 hover:text-foreground transition-all duration-200 backdrop-blur-sm"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/70 mt-3 pl-1">
                  Tap one to ask Logan about it.
                </p>
              </section>

              {/* ================= Testimonials ================= */}
              <section>
                <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-3 pl-1">
                  Real women, real words
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {TESTIMONIALS.map((t) => (
                    <figure key={t.name} className="bg-card/40 border border-border/40 rounded-2xl p-4 backdrop-blur-sm">
                      <blockquote className="text-sm text-foreground/85 leading-relaxed">"{t.quote}"</blockquote>
                      <figcaption className="text-xs text-muted-foreground mt-2">— {t.name}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>

              {/* ================= Final CTA — signup ================= */}
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
                    <InlineChatAuth />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground italic pl-1 mt-8">
                  Thank you for building Logan with me,<br />
                  Raquella <span className="text-primary not-italic">💚</span>
                </p>
              </section>
            </>
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
                      <InlineChatAuth />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

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
