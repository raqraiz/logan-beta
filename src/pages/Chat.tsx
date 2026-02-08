import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { LoganLogo } from "@/components/LoganLogo";
import { Send, Loader2, LogOut, Smile } from "lucide-react";
import { format } from "date-fns";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: string;
  emoji_reaction?: string | null;
  created_at: string;
  user_id: string;
  metadata?: unknown;
}

const EMOJI_REACTIONS = ["👍", "❤️", "🤔", "😊", "💪"];

const Chat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  // Fetch messages
  useEffect(() => {
    if (!user) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        toast({ title: "Failed to load messages", variant: "destructive" });
      } else {
        // Cast role to expected type
        const typedMessages = (data || []).map((m) => ({
          ...m,
          role: m.role as "user" | "assistant" | "system",
        }));
        setMessages(typedMessages);
      }
      setIsLoading(false);
    };

    fetchMessages();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("chat_messages_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as ChatMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || !user || isSending) return;

    const messageContent = inputValue.trim();
    setInputValue("");
    setIsSending(true);

    try {
      const { error } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: messageContent,
        message_type: "text",
      });

      if (error) throw error;
      
      inputRef.current?.focus();
    } catch (error) {
      console.error("Error sending message:", error);
      toast({ title: "Failed to send message", variant: "destructive" });
      setInputValue(messageContent);
    } finally {
      setIsSending(false);
    }
  };

  const sendReaction = async (messageId: string, emoji: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: emoji,
        message_type: "reaction",
        metadata: { reaction_to: messageId },
      });

      if (error) throw error;
      setShowEmojiPicker(null);
    } catch (error) {
      console.error("Error sending reaction:", error);
      toast({ title: "Failed to send reaction", variant: "destructive" });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LoganLogo size="sm" />
            <div>
              <h1 className="font-display font-semibold text-foreground">Logan</h1>
              <p className="text-xs text-muted-foreground">Your cycle companion</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-3xl mx-auto py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <LoganLogo size="sm" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Welcome to Logan</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                I'm here to help you understand your cycle patterns. You'll receive personalized insights, 
                and you can share updates or ask questions anytime.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`relative max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? message.message_type === "reaction"
                        ? "bg-transparent text-3xl"
                        : "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  }`}
                >
                  {message.message_type !== "reaction" && (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                  {message.message_type === "reaction" && (
                    <span className="text-3xl">{message.content}</span>
                  )}
                  
                  <div className={`flex items-center gap-2 mt-1 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}>
                    <span className={`text-xs ${
                      message.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}>
                      {format(new Date(message.created_at), "h:mm a")}
                    </span>
                    
                    {/* Emoji reaction button for assistant messages */}
                    {message.role === "assistant" && message.message_type !== "reaction" && (
                      <div className="relative">
                        <button
                          onClick={() => setShowEmojiPicker(showEmojiPicker === message.id ? null : message.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Smile className="w-4 h-4" />
                        </button>
                        
                        {showEmojiPicker === message.id && (
                          <div className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-lg shadow-lg p-2 flex gap-1 z-20">
                            {EMOJI_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => sendReaction(message.id, emoji)}
                                className="hover:bg-accent rounded p-1 text-lg transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border/50 bg-card/50 backdrop-blur-sm sticky bottom-0">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex gap-3">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Share an update or ask a question..."
              className="flex-1 h-12"
              disabled={isSending}
            />
            <Button 
              type="submit" 
              size="icon" 
              className="h-12 w-12"
              disabled={!inputValue.trim() || isSending}
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Logan learns from your updates to personalize your insights
          </p>
        </form>
      </div>
    </div>
  );
};

export default Chat;
