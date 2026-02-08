import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoganLogo } from "@/components/LoganLogo";
import { Send, Loader2, Sparkles } from "lucide-react";
import { InlineChatAuth } from "./InlineChatAuth";

interface TrialMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const LOGAN_RESPONSES = [
  "I love that you're curious! 💜 I'm Logan - I help you understand and work *with* your cycle, not against it. Think of me as your personal performance coach who knows exactly where you are in your cycle and what that means for your energy, focus, and mood.\n\nWhat brings you here today? Are you looking to optimize your training, understand your patterns better, or just tired of feeling like you're fighting your own body?",
  "That's exactly what I'm here for! Most cycle tracking apps just tell you *what day* you're on. I tell you *what to do about it* - when to push hard, when to protect your energy, and how to plan smarter around your biology.\n\nTo give you personalized insights, I'll need to learn a bit about you first. Ready to create your account and get started? It only takes about 2 minutes. 🚀",
];

export const TrialChat = () => {
  const [messages, setMessages] = useState<TrialMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! 👋 I'm Logan, your intelligent cycle companion. I deliver proactive, personalized guidance so you can plan smarter around your biology.\n\nGo ahead - ask me anything about what I can help with, or just say hi!",
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
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
    }]);

    setIsTyping(true);

    // Simulate typing delay
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

    // Add Logan's response
    const responseIndex = Math.min(trialMessageCount, LOGAN_RESPONSES.length - 1);
    setMessages(prev => [...prev, {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: LOGAN_RESPONSES[responseIndex],
    }]);

    setTrialMessageCount(prev => prev + 1);
    setIsTyping(false);

    // After 2 exchanges, show auth prompt
    if (trialMessageCount >= 1) {
      setTimeout(() => setShowAuth(true), 500);
    }

    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" />
            <div>
              <h1 className="font-display font-semibold text-foreground">Logan</h1>
              <p className="text-xs text-muted-foreground">Intelligent cycle guidance</p>
            </div>
          </div>
          <Link
            to="/consent"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Privacy
          </Link>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-3xl mx-auto py-6 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {/* Inline auth prompt after trial */}
          {showAuth && (
            <div className="py-4">
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6 text-center">
                <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
                <h3 className="font-display font-semibold text-lg text-foreground mb-2">
                  Ready for personalized insights?
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your free account to get cycle guidance tailored to your unique patterns.
                </p>
                <InlineChatAuth />
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input - hide when showing auth */}
      {!showAuth && (
        <div className="border-t border-border/50 bg-card/50 backdrop-blur-sm sticky bottom-0">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex gap-3">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask Logan anything..."
                className="flex-1 h-12"
                disabled={isTyping}
              />
              <Button
                type="submit"
                size="icon"
                className="h-12 w-12"
                disabled={!inputValue.trim() || isTyping}
              >
                {isTyping ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Try chatting with Logan to see how it works
            </p>
          </form>
        </div>
      )}
    </div>
  );
};
