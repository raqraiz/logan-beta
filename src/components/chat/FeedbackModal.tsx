import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";

const CATEGORIES = [
  { value: "bug", label: "🐛 Bug report" },
  { value: "feature", label: "💡 Feature request" },
  { value: "general", label: "💬 General feedback" },
  { value: "content", label: "📝 Content / accuracy" },
];

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const FeedbackModal = ({ open, onOpenChange }: FeedbackModalProps) => {
  const { user } = useAuth();
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() || !user) return;

    setSending(true);
    const { error } = await supabase.from("user_feedback" as any).insert({
      user_id: user.id,
      category,
      message: message.trim(),
    });

    setSending(false);

    if (error) {
      toast({ title: "Failed to send feedback", variant: "destructive" });
      return;
    }

    toast({ title: "Thanks for your feedback! 💜", description: "It helps us make Logan better." });
    setMessage("");
    setCategory("general");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Send feedback</DialogTitle>
          <DialogDescription>
            We're building Logan with you — tell us what's working, what's not, or what you wish it did.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[120px] resize-none"
            maxLength={2000}
          />

          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              {message.length}/2000
            </span>
            <Button
              onClick={handleSubmit}
              disabled={!message.trim() || sending}
              size="sm"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
