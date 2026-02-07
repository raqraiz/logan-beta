import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { 
  Sparkles, Send, RefreshCw, ThumbsUp, ThumbsDown, 
  MessageSquare, Reply, ChevronDown 
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ThreadItem {
  id: string;
  type: "insight" | "feedback" | "admin_reply" | "cycle_update";
  timestamp: string;
  content: string;
  metadata?: {
    status?: string;
    insight_type?: string;
    emoji_reaction?: string | null;
    is_useful?: boolean | null;
    emotion?: string | null;
    action_taken?: boolean | null;
    improvement_suggestion?: string | null;
    admin_reply_sent?: boolean | null;
    category?: string | null;
    update_type?: string | null;
    feedback_id?: string;
  };
}

interface ConversationThreadProps {
  participantId: string;
  participantName: string;
  onClose: () => void;
}

export function ConversationThread({ 
  participantId, 
  participantName,
  onClose 
}: ConversationThreadProps) {
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const fetchThread = async () => {
    setLoading(true);
    try {
      // Fetch insights
      const { data: insights, error: insightsError } = await supabase
        .from("insights")
        .select("*")
        .eq("participant_id", participantId)
        .order("created_at", { ascending: true });

      if (insightsError) throw insightsError;

      // Fetch feedback with related insight info
      const { data: feedback, error: feedbackError } = await supabase
        .from("feedback")
        .select("*, insights(content, insight_type)")
        .eq("participant_id", participantId)
        .order("created_at", { ascending: true });

      if (feedbackError) throw feedbackError;

      // Fetch cycle updates (user messages)
      const { data: updates, error: updatesError } = await supabase
        .from("cycle_updates")
        .select("*")
        .eq("participant_id", participantId)
        .order("created_at", { ascending: true });

      if (updatesError) throw updatesError;

      // Build unified thread
      const threadItems: ThreadItem[] = [];

      // Add insights
      insights?.forEach((insight) => {
        threadItems.push({
          id: insight.id,
          type: "insight",
          timestamp: insight.sent_at || insight.created_at,
          content: insight.content,
          metadata: {
            status: insight.status,
            insight_type: insight.insight_type,
          },
        });
      });

      // Add feedback responses
      feedback?.forEach((fb) => {
        // User's feedback response
        const feedbackContent = [
          fb.free_form_text,
          fb.improvement_suggestion ? `Suggestion: ${fb.improvement_suggestion}` : null,
        ].filter(Boolean).join("\n");

        if (feedbackContent || fb.emoji_reaction || fb.is_useful !== null || fb.emotion) {
          threadItems.push({
            id: `fb-${fb.id}`,
            type: "feedback",
            timestamp: fb.created_at,
            content: feedbackContent || "",
            metadata: {
              emoji_reaction: fb.emoji_reaction,
              is_useful: fb.is_useful,
              emotion: fb.emotion,
              action_taken: fb.action_taken,
              improvement_suggestion: fb.improvement_suggestion,
              feedback_id: fb.id,
            },
          });
        }

        // Admin reply if exists
        if (fb.admin_reply) {
          threadItems.push({
            id: `reply-${fb.id}`,
            type: "admin_reply",
            timestamp: fb.admin_reply_at || fb.created_at,
            content: fb.admin_reply,
            metadata: {
              admin_reply_sent: fb.admin_reply_sent,
            },
          });
        }
      });

      // Add cycle updates (incoming messages)
      updates?.forEach((update) => {
        threadItems.push({
          id: update.id,
          type: "cycle_update",
          timestamp: update.created_at,
          content: update.description,
          metadata: {
            category: update.category,
            update_type: update.update_type,
          },
        });
      });

      // Sort by timestamp
      threadItems.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      setThread(threadItems);
    } catch (error) {
      console.error("Error fetching thread:", error);
      toast({ title: "Error loading conversation", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useState(() => {
    fetchThread();
  });

  const handleGenerateReply = async (feedbackId: string) => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: { feedbackId },
      });

      if (error) throw error;
      if (data?.content) {
        setReplyText(data.content);
        toast({ title: "Reply generated" });
      }
    } catch (error) {
      console.error("Error generating reply:", error);
      toast({
        title: "Failed to generate reply",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendReply = async (feedbackId: string) => {
    if (!replyText.trim()) return;

    setIsSending(true);
    try {
      // Save the reply
      const { error: updateError } = await supabase
        .from("feedback")
        .update({
          admin_reply: replyText.trim(),
          admin_reply_at: new Date().toISOString(),
          admin_reply_sent: false,
        })
        .eq("id", feedbackId);

      if (updateError) throw updateError;

      // Get participant Telegram info
      const { data: participant } = await supabase
        .from("participants")
        .select("telegram_chat_id, preferred_channel")
        .eq("id", participantId)
        .single();

      if (participant?.preferred_channel === "telegram" && participant?.telegram_chat_id) {
        const { error: sendError } = await supabase.functions.invoke("send-reply-telegram", {
          body: {
            chatId: participant.telegram_chat_id,
            message: replyText.trim(),
            feedbackId,
          },
        });

        if (sendError) throw sendError;

        await supabase
          .from("feedback")
          .update({ admin_reply_sent: true })
          .eq("id", feedbackId);

        toast({ title: "Reply sent via Telegram" });
      } else {
        toast({ title: "Reply saved as draft" });
      }

      setReplyText("");
      setReplyingTo(null);
      fetchThread();
    } catch (error) {
      console.error("Error sending reply:", error);
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-background py-2 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ChevronDown className="w-4 h-4 mr-1 rotate-90" />
            Back
          </Button>
          <h3 className="font-semibold text-lg">{participantName}</h3>
          <Badge variant="outline">{thread.length} messages</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchThread}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Thread */}
      <div className="space-y-3 pb-4">
        {thread.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No conversation history yet</p>
          </div>
        ) : (
          thread.map((item) => (
            <div key={item.id} className="space-y-2">
              {/* Message bubble */}
              <div
                className={cn(
                  "max-w-[85%] rounded-lg p-3",
                  item.type === "insight" || item.type === "admin_reply"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted"
                )}
              >
                {/* Type indicator */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs opacity-70">
                    {item.type === "insight" && "Insight sent"}
                    {item.type === "admin_reply" && "Your reply"}
                    {item.type === "feedback" && "Response"}
                    {item.type === "cycle_update" && "Message"}
                  </span>
                  {item.metadata?.insight_type && (
                    <Badge 
                      variant="secondary" 
                      className="text-[10px] px-1.5 py-0 bg-primary-foreground/20"
                    >
                      {item.metadata.insight_type}
                    </Badge>
                  )}
                  {item.metadata?.status === "pending" && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Pending
                    </Badge>
                  )}
                  {item.metadata?.admin_reply_sent === false && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-500">
                      Draft
                    </Badge>
                  )}
                </div>

                {/* Feedback metadata */}
                {item.type === "feedback" && (
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {item.metadata?.emoji_reaction && (
                      <span className="text-2xl">{item.metadata.emoji_reaction}</span>
                    )}
                    {item.metadata?.is_useful !== null && (
                      <Badge variant={item.metadata.is_useful ? "default" : "secondary"} className="text-xs">
                        {item.metadata.is_useful ? (
                          <><ThumbsUp className="w-3 h-3 mr-1" /> Useful</>
                        ) : (
                          <><ThumbsDown className="w-3 h-3 mr-1" /> Not useful</>
                        )}
                      </Badge>
                    )}
                    {item.metadata?.emotion && (
                      <Badge variant="outline" className="text-xs">
                        {item.metadata.emotion}
                      </Badge>
                    )}
                    {item.metadata?.action_taken && (
                      <Badge className="text-xs bg-green-600">Action taken</Badge>
                    )}
                  </div>
                )}

                {/* Category for cycle updates */}
                {item.type === "cycle_update" && item.metadata?.category && (
                  <Badge variant="outline" className="text-xs mb-2">
                    {item.metadata.category}
                  </Badge>
                )}

                {/* Content */}
                {item.content && (
                  <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                )}

                {/* Timestamp */}
                <p className="text-[10px] opacity-60 mt-2">
                  {format(new Date(item.timestamp), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>

              {/* Reply button for feedback items */}
              {item.type === "feedback" && item.metadata?.feedback_id && (
                <div className="mr-auto">
                  {replyingTo === item.metadata.feedback_id ? (
                    <div className="max-w-[85%] space-y-2 p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Reply</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateReply(item.metadata!.feedback_id!)}
                          disabled={isGenerating}
                        >
                          {isGenerating ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3 mr-1" />
                          )}
                          AI Generate
                        </Button>
                      </div>
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write a reply..."
                        className="min-h-[80px] text-sm"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReplyingTo(null);
                            setReplyText("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSendReply(item.metadata!.feedback_id!)}
                          disabled={isSending || !replyText.trim()}
                        >
                          {isSending ? (
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3 mr-1" />
                          )}
                          Send
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReplyingTo(item.metadata!.feedback_id!)}
                      className="text-muted-foreground text-xs"
                    >
                      <Reply className="w-3 h-3 mr-1" />
                      Reply
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
