import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoganLogo } from "@/components/LoganLogo";
import { Send, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InlineChatAuth } from "./InlineChatAuth";

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

export const TrialChat = () => {
  const [messages, setMessages] = useState<TrialMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey, I'm Logan. Your cycle runs in four phases: Menstruation, Follicular, Ovulation, and Luteal. Each one shifts how you think, move, and recover. I track where you are and help you use it. What do you want to know?",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [trialMessageCount, setTrialMessageCount] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showAuth]);

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
            <div className="relative">
              <LoganLogo size="sm" />
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg animate-pulse" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-foreground text-lg tracking-tight">Logan</h1>
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
      <ScrollArea className="flex-1 px-4 relative z-10">
        <div className="max-w-3xl mx-auto py-8 space-y-6">
          {messages.map((message, index) => (
            <div
              key={message.id}
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
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
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
                    <Sparkles className="w-10 h-10 text-primary" />
                    <div className="absolute inset-0 bg-primary/30 rounded-full blur-xl animate-pulse" />
                  </div>
                  <h3 className="font-display font-semibold text-xl text-foreground mb-3">
                    Ready for personalized insights?
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                    Create an account to get cycle guidance tailored to your unique patterns.
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
