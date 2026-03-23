import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { LoganLogo } from "@/components/LoganLogo";
import {
  Send, Loader2, ArrowLeft, Pin, Trash2, Eye, EyeOff,
  MessageCircle, HelpCircle, Lightbulb, Megaphone, Users
} from "lucide-react";
import { format } from "date-fns";
import { InlineChatAuth } from "@/components/chat/InlineChatAuth";

const CHANNELS = [
  { id: "feedback", label: "Feedback", icon: Megaphone, description: "Share feedback, ideas & questions with the Logan community" },
] as const;

type Channel = typeof CHANNELS[number]["id"];

interface CommunityMessage {
  id: string;
  user_id: string;
  channel: string;
  content: string;
  display_name: string;
  is_anonymous: boolean;
  is_pinned: boolean;
  created_at: string;
}

const Community = () => {
  const { user, loading: authLoading } = useAuth();
  const [channel, setChannel] = useState<Channel>("feedback");
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [profileName, setProfileName] = useState("User");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check admin status
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
      setIsAdmin(!!data);
    });
  }, [user?.id]);

  // Load profile name
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).single().then(({ data }) => {
      if (data?.full_name) setProfileName(data.full_name);
    });
  }, [user?.id]);

  // Fetch messages for current channel
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("community_messages_public")
        .select("*")
        .eq("channel", channel)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data as CommunityMessage[]);
      }
      setLoading(false);
    };
    fetchMessages();

    // Realtime subscription
    const sub = supabase
      .channel(`community-${channel}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "community_messages",
        filter: `channel=eq.${channel}`,
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          setMessages(prev => [...prev, payload.new as CommunityMessage]);
        } else if (payload.eventType === "DELETE") {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id));
        } else if (payload.eventType === "UPDATE") {
          setMessages(prev => prev.map(m => m.id === (payload.new as any).id ? payload.new as CommunityMessage : m));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handlePost = async () => {
    if (!user) { setShowAuthPrompt(true); return; }
    if (!newMessage.trim()) return;

    setPosting(true);
    const displayName = isAnonymous ? `Anonymous ${Math.floor(Math.random() * 9000 + 1000)}` : profileName;

    const { error } = await supabase.from("community_messages").insert({
      user_id: user.id,
      channel,
      content: newMessage.trim(),
      display_name: displayName,
      is_anonymous: isAnonymous,
    });

    if (error) {
      toast({ title: "Couldn't post", description: error.message, variant: "destructive" });
    } else {
      setNewMessage("");
    }
    setPosting(false);
  };

  const handlePin = async (id: string, pinned: boolean) => {
    await supabase.from("community_messages").update({ is_pinned: !pinned }).eq("id", id);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("community_messages").delete().eq("id", id);
  };

  const activeChannel = CHANNELS.find(c => c.id === channel)!;

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card/80 backdrop-blur-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <LoganLogo size="sm" />
        <div className="flex-1">
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Community
          </h1>
          <p className="text-xs text-muted-foreground">{activeChannel.description}</p>
        </div>
      </header>

      {/* Channel tabs - hidden while single channel */}
      {CHANNELS.length > 1 && (
        <div className="border-b border-border px-4 py-2 flex gap-2 overflow-x-auto scrollbar-none">
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const isActive = channel === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => setChannel(ch.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {ch.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <activeChannel.icon className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No messages in #{activeChannel.label} yet.</p>
            <p className="text-sm text-muted-foreground/70">Be the first to start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-xl p-3 ${
                  msg.is_pinned
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-card border border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                      {msg.is_anonymous ? "?" : msg.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        {msg.display_name}
                      </span>
                      {msg.is_anonymous && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1">anon</Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-2">
                        {format(new Date(msg.created_at), "MMM d, h:mm a")}
                      </span>
                    </div>
                  </div>

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handlePin(msg.id, msg.is_pinned)}
                        className={`p-1 rounded transition-colors ${
                          msg.is_pinned ? "text-primary" : "text-muted-foreground hover:text-foreground"
                        }`}
                        title={msg.is_pinned ? "Unpin" : "Pin"}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {msg.is_pinned && (
                  <Badge className="mt-1 mb-1 text-[10px] bg-primary/20 text-primary border-0">
                    📌 Pinned
                  </Badge>
                )}
                <p className="text-sm text-foreground/90 mt-1.5 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Post area */}
      {showAuthPrompt && !user ? (
        <div className="border-t border-border">
          <InlineChatAuth onAuthSuccess={() => setShowAuthPrompt(false)} />
        </div>
      ) : (
        <div className="border-t border-border p-3 bg-card/60 backdrop-blur-sm">
          {!user ? (
            <button
              onClick={() => setShowAuthPrompt(true)}
              className="w-full text-center py-3 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Sign in to join the conversation →
            </button>
          ) : (
            <div className="max-w-2xl mx-auto space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAnonymous(!isAnonymous)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors ${
                    isAnonymous
                      ? "bg-accent/20 text-accent"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isAnonymous ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {isAnonymous ? "Anonymous" : profileName}
                </button>
                <span className="text-xs text-muted-foreground">
                  posting in #{activeChannel.label}
                </span>
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Share something in #${activeChannel.label}...`}
                  className="min-h-[44px] max-h-[120px] resize-none bg-background text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handlePost();
                    }
                  }}
                />
                <Button
                  onClick={handlePost}
                  disabled={posting || !newMessage.trim()}
                  size="icon"
                  className="shrink-0 self-end"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Community;
