import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, MessageSquare, User, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
import { Json } from "@/integrations/supabase/types";

interface ChatMessage {
  id: string;
  user_id: string;
  role: string;
  content: string;
  message_type: string | null;
  emoji_reaction: string | null;
  metadata: Json | null;
  created_at: string;
}

interface ChatUserDetailPanelProps {
  userId: string;
  userName: string;
  onClose: () => void;
  onRefresh: () => void;
}



interface MessageMetadata {
  has_cycle_visual?: boolean;
  cycle_day?: number;
  cycle_phase?: string;
  cycle_length_days?: number;
  [key: string]: unknown;
}

export function ChatUserDetailPanel({ 
  userId, 
  userName,
  onClose,
  onRefresh 
}: ChatUserDetailPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({ title: "Error loading messages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDeleteUser = async () => {
    setDeleting(true);
    try {
      // Delete chat messages first (cascade)
      const { error: messagesError } = await supabase
        .from("chat_messages")
        .delete()
        .eq("user_id", userId);

      if (messagesError) throw messagesError;

      // Delete profile
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileError) throw profileError;

      toast({ title: "User deleted successfully" });
      onRefresh();
      onClose();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({ 
        title: "Error deleting user", 
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive" 
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <User className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{userName}</h2>
            <p className="text-sm text-muted-foreground">
              {messages.length} messages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete user?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{userName}</strong> and all their chat history. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteUser}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={fetchMessages}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAssistant = msg.role === "assistant" || msg.role === "system";
            const metadata = msg.metadata as MessageMetadata | null;
            const hasCycleVisual = metadata?.has_cycle_visual;
            
            return (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%]",
                  isAssistant ? "ml-auto" : "mr-auto"
                )}
              >
                {/* Role indicator */}
                <div className={cn(
                  "text-xs mb-1 flex items-center gap-2",
                  isAssistant ? "justify-end text-muted-foreground" : "text-muted-foreground"
                )}>
                  <span>{msg.role === "user" ? "User" : msg.role === "assistant" ? "Logan" : "System"}</span>
                  {msg.message_type && msg.message_type !== "text" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {msg.message_type}
                    </Badge>
                  )}
                </div>

                {/* Message bubble */}
                <div
                  className={cn(
                    "rounded-lg p-3",
                    isAssistant
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {/* Cycle visual if present */}
                  {hasCycleVisual && metadata?.cycle_day && metadata?.cycle_phase && (
                    <div className="mb-3">
                      <ChatCycleCircle
                        cycleDay={metadata.cycle_day}
                        phase={metadata.cycle_phase}
                        cycleLengthDays={metadata.cycle_length_days || 28}
                      />
                    </div>
                  )}

                  {/* Message content */}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                  {/* Emoji reaction */}
                  {msg.emoji_reaction && (
                    <div className="mt-2">
                      <span className="text-xl">{msg.emoji_reaction}</span>
                    </div>
                  )}

                  {/* Timestamp */}
                  <p className={cn(
                    "text-[10px] mt-2",
                    isAssistant ? "text-primary-foreground/60" : "text-muted-foreground"
                  )}>
                    {format(new Date(msg.created_at), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
