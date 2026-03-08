import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoganLogo } from "@/components/LoganLogo";
import { LoganFullLogo } from "@/components/LoganFullLogo";
import { Send, Loader2, ArrowDown } from "lucide-react";
import { VoiceInputButton } from "./VoiceInputButton";
import { supabase } from "@/integrations/supabase/client";
import { InlineChatAuth } from "./InlineChatAuth";
import { MarkdownMessage } from "./MarkdownMessage";

interface TrialMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "What is the luteal phase?",
  "When do I have the most energy in my cycle?",
  "How can cycle awareness help my workouts?",
];

const getContextualHeadline = (question: string): string => {
  const q = question.toLowerCase();
  if (q.includes("luteal")) return "That luteal chaos? I can help you see it coming";
  if (q.includes("energy") || q.includes("strongest")) return "Your energy has a pattern. I can show you";
  if (q.includes("workout") || q.includes("training") || q.includes("lift")) return "Your body wants different things at different times";
  if (q.includes("follicular")) return "That post-period boost is real. Let me show you how to use it";
  if (q.includes("ovulat")) return "There's a reason you feel unstoppable some weeks";
  if (q.includes("period") || q.includes("menstrual") || q.includes("bleed")) return "Your period is actually a reset, not a setback";
  if (q.includes("pms") || q.includes("pmdd")) return "What if you could see PMS coming days in advance?";
  if (q.includes("hormone") || q.includes("cycle") || q.includes("phase")) return "Once you see the pattern, everything clicks";
  return "What if you could stop guessing and start planning?";
};

const getContextualDescription = (question: string): string => {
  const q = question.toLowerCase();
  if (q.includes("luteal")) return "Sign up and I'll learn your cycle so I can warn you before the hard days hit. No more getting blindsided.";
  if (q.includes("energy") || q.includes("strongest")) return "Sign up and I'll track where you are in your cycle each day so you know when to go hard and when to take it easy.";
  if (q.includes("workout") || q.includes("training") || q.includes("lift")) return "Sign up and I'll help you work with your body instead of wondering why some weeks feel impossible.";
  if (q.includes("pms") || q.includes("pmdd")) return "Sign up and I'll track your patterns so you can prepare for the rough days instead of being caught off guard.";
  return "Sign up and I'll learn your unique patterns so I can give you a heads up before things shift.";
};

export const TrialChat = () => {
  const [messages, setMessages] = useState<TrialMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey, I'm Logan. You know how some weeks you feel like you can take on anything, and then other weeks everything is just... harder? That's not random. Your cycle has four phases and each one changes your energy, your mood, even how you think. I help you see the pattern so you can stop fighting it. What do you want to know?",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [trialMessageCount, setTrialMessageCount] = useState(0);
  const [lastUserQuestion, setLastUserQuestion] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll only when messages change (not when auth UI appears)
  useEffect(() => {
    if (!isNearBottomRef.current) return;

    const viewport = scrollContainerRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement | null;

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
    const viewport = scrollContainerRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement | null;

    if (!viewport) return;

    const updateScrollState = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isNearBottomRef.current = distanceFromBottom < 150;
      setShowScrollButton(distanceFromBottom > 120);
    };

    updateScrollState();
    viewport.addEventListener("scroll", updateScrollState, { passive: true });

    return () => viewport.removeEventListener("scroll", updateScrollState);
  }, [messages.length, showAuth]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    
    // Add user message
    const newUserMessage: TrialMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
    };
    
    setMessages(prev => [...prev, newUserMessage]);
    setLastUserQuestion(userMessage);
    setIsTyping(true);

    try {
      // Call the trial-chat edge function
      const { data, error } = await supabase.functions.invoke("trial-chat", {
        body: {
          messages: [...messages, newUserMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        },
      });

      if (error) throw error;

      const aiResponse = data?.response || "I'd love to help you understand your cycle better. What would you like to know?";

      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: aiResponse,
      }]);
    } catch (error) {
      console.error("Trial chat error:", error);
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "I can help you understand your cycle phases and how they affect your energy and mood. What would you like to know?",
      }]);
    }

    setTrialMessageCount(prev => prev + 1);
    setIsTyping(false);

    // After 1 exchange, show auth prompt
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

  const handleSuggestionClick = (question: string) => {
    setInputValue(question);
    // Auto-submit after a brief delay so user sees what was selected
    setTimeout(() => {
      const form = document.querySelector('form');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, 100);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-1/3 left-0 w-72 h-72 bg-primary/3 rounded-full blur-3xl transform -translate-x-1/2" />
      </div>

      {/* Header */}
      <header className="border-b border-border/30 bg-card/30 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <LoganFullLogo size="sm" />
             <div>
               <p className="text-xs text-muted-foreground">Intelligent cycle guidance</p>
             </div>
           </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAuth(true)}
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors relative group"
            >
              Sign in
              <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-primary group-hover:w-full transition-all duration-300" />
            </button>
            <Link
              to="/consent"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea
        ref={scrollContainerRef}
        className="flex-1 px-4 relative z-10"
        onScrollCapture={(e) => {
          const el = e.currentTarget.querySelector('[data-radix-scroll-area-viewport]');
          if (el) {
            const { scrollTop, scrollHeight, clientHeight } = el;
            isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
          }
        }}
      >
        <div className="max-w-3xl mx-auto py-8 space-y-6">
          {messages.map((message, index) => (
            <div
              key={message.id}
              ref={index === messages.length - 1 ? lastMessageRef : null}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              style={{ animationDelay: `${index * 50}ms` }}
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
          ))}

          {/* Suggested questions - show only at start */}
          {messages.length === 1 && !isTyping && (
            <div className="flex flex-wrap gap-3 justify-start pl-2 animate-fade-in" style={{ animationDelay: "200ms" }}>
              {SUGGESTED_QUESTIONS.map((question, index) => (
                <button
                  key={question}
                  onClick={() => handleSuggestionClick(question)}
                  className="px-5 py-2.5 text-sm bg-primary/5 hover:bg-primary/15 text-primary border border-primary/30 hover:border-primary/50 rounded-full transition-all duration-300 hover:shadow-glow hover:scale-105"
                  style={{ animationDelay: `${300 + index * 100}ms` }}
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          {/* Typing indicator */}
          {isTyping && (
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

          {/* Inline auth prompt after trial */}
          {showAuth && (
            <div className="py-6 animate-fade-in">
              <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/30 rounded-3xl p-8 text-center overflow-hidden">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
                <div className="absolute top-0 left-1/2 w-32 h-32 bg-primary/20 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2" />
                
                <div className="relative z-10">
                  <div className="relative inline-block mb-4">
                    <LoganLogo size="md" />
                  </div>
                  <h3 className="font-display font-semibold text-xl text-foreground mb-3">
                    {getContextualHeadline(lastUserQuestion)}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                    {getContextualDescription(lastUserQuestion)}
                  </p>
                  <InlineChatAuth />
                </div>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input - hide when showing auth */}
      {!showAuth && (
        <div className="border-t border-border/30 bg-card/30 backdrop-blur-xl sticky bottom-0 relative z-10">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto px-4 py-5">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask Logan anything..."
                  className="h-13 pl-5 pr-4 bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all duration-300"
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
                {isTyping ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/70 text-center mt-3">
              Try chatting with Logan to see how it works
            </p>
          </form>
        </div>
      )}
    </div>
  );
};
