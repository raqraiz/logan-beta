import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Sparkles, Send, RefreshCw } from "lucide-react";

interface FeedbackReplyFormProps {
  feedbackId: string;
  participantId: string;
  existingReply?: string | null;
  onReplySaved: () => void;
}

export function FeedbackReplyForm({
  feedbackId,
  participantId,
  existingReply,
  onReplySaved,
}: FeedbackReplyFormProps) {
  const [reply, setReply] = useState(existingReply || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerateReply = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: { feedbackId },
      });

      if (error) throw error;

      if (data?.content) {
        setReply(data.content);
        toast({ title: "Reply generated" });
      }
    } catch (error) {
      console.error("Error generating reply:", error);
      toast({
        title: "Failed to generate reply",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveReply = async () => {
    if (!reply.trim()) {
      toast({ title: "Please enter a reply", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("feedback")
        .update({
          admin_reply: reply.trim(),
          admin_reply_at: new Date().toISOString(),
          admin_reply_sent: false,
        })
        .eq("id", feedbackId);

      if (error) throw error;

      toast({ title: "Reply saved" });
      onReplySaved();
    } catch (error) {
      console.error("Error saving reply:", error);
      toast({
        title: "Failed to save reply",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendReply = async () => {
    if (!reply.trim()) {
      toast({ title: "Please enter a reply", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      // First save the reply
      const { error: updateError } = await supabase
        .from("feedback")
        .update({
          admin_reply: reply.trim(),
          admin_reply_at: new Date().toISOString(),
          admin_reply_sent: false,
        })
        .eq("id", feedbackId);

      if (updateError) throw updateError;

      // Get participant info to send message
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("telegram_chat_id, preferred_channel")
        .eq("id", participantId)
        .single();

      if (participantError) throw participantError;

      if (participant?.preferred_channel === "telegram" && participant?.telegram_chat_id) {
        // Send via Telegram using the dedicated reply function
        const { error: sendError } = await supabase.functions.invoke("send-reply-telegram", {
          body: {
            chatId: participant.telegram_chat_id,
            message: reply.trim(),
            feedbackId,
          },
        });

        if (sendError) throw sendError;

        // Mark as sent
        await supabase
          .from("feedback")
          .update({ admin_reply_sent: true })
          .eq("id", feedbackId);

        toast({ title: "Reply sent via Telegram" });
      } else {
        toast({ 
          title: "Reply saved", 
          description: "Participant doesn't have Telegram configured" 
        });
      }

      onReplySaved();
    } catch (error) {
      console.error("Error sending reply:", error);
      toast({
        title: "Failed to send reply",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Reply</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerateReply}
          disabled={isGenerating}
          className="ml-auto"
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
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Write a reply or generate one with AI..."
        className="min-h-[80px] text-sm"
      />
      
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveReply}
          disabled={isSaving || !reply.trim()}
        >
          Save Draft
        </Button>
        <Button
          size="sm"
          onClick={handleSendReply}
          disabled={isSaving || !reply.trim()}
        >
          {isSaving ? (
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Send className="w-3 h-3 mr-1" />
          )}
          Send Reply
        </Button>
      </div>
    </div>
  );
}
