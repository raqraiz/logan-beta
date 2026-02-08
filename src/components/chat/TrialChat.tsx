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
      content: "Hey, I'm Logan - your intelligent cycle companion. I help you understand and work with your cycle, not against it. Ask me anything about menstrual phases, hormones, or how cycle awareness can help with your energy and performance.",
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
      
      // Add signup nudge after first response
      const responseWithNudge = trialMessageCount >= 1
        ? `${aiResponse}\n\nTo get personalized insights based on YOUR cycle, create a free account - it only takes a minute.`
        : aiResponse;

      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responseWithNudge,
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

    // After 3 exchanges, show auth prompt
    if (trialMessageCount >= 2) {
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

          {/* Suggested questions - show only at start */}
          {messages.length === 1 && !isTyping && (
            <div className="flex flex-wrap gap-2 justify-start pl-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  onClick={() => handleSuggestionClick(question)}
                  className="px-4 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-full transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          )}

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
