import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";

type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };

const CATEGORIES = [
  { value: "bug", label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "general", label: "General feedback" },
  { value: "content", label: "Content / accuracy" },
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
  // Set after Send when the text had health details. Until she answers, the details stay hidden from the team.
  const [consentFor, setConsentFor] = useState<string | null>(null);

  const reset = () => {
    setMessage("");
    setCategory("general");
    setConsentFor(null);
  };

  const handleSubmit = async () => {
    if (!message.trim() || !user) return;

    setSending(true);
    // Saved on the server: it checks the text for health details first, and the feedback is always saved.
    const { data, error } = await supabase.functions.invoke("submit-feedback", {
      body: { category, message: message.trim() },
    });
    setSending(false);

    if (error || !data?.id) {
      toast({ title: "Failed to send feedback", variant: "destructive" });
      return;
    }

    toast({ title: "Thanks for your feedback!", description: "It helps us make Logan better." });
    if (data.health_detected) {
      setConsentFor(data.id as string);
      return;
    }
    reset();
    onOpenChange(false);
  };

  const answerConsent = async (allow: boolean) => {
    const id = consentFor;
    if (!id) return;
    setSending(true);
    const { error } = await (supabase as unknown as RpcClient).rpc("set_feedback_consent", { _id: id, _allow: allow });
    setSending(false);
    if (error) {
      toast({ title: "We couldn't save your choice", description: "Your health details stay hidden.", variant: "destructive" });
    }
    reset();
    onOpenChange(false);
  };

  // Closing without answering keeps the details hidden.
  const handleOpenChange = (next: boolean) => {
    if (!next && consentFor) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {consentFor ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-lg">You mentioned health details.</DialogTitle>
              <DialogDescription className="text-base text-foreground">
                Can a senior member of the Logan team read them?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={sending} onClick={() => answerConsent(true)}>Yes, they can</Button>
              <Button className="flex-1" variant="outline" disabled={sending} onClick={() => answerConsent(false)}>Keep them hidden</Button>
            </div>
            <p className="text-xs text-muted-foreground">If hidden, the team sees your feedback with health details removed.</p>
          </div>
        ) : (<>
        <DialogHeader>
          <DialogTitle className="text-lg">Send feedback</DialogTitle>
          <DialogDescription>
            We're building Logan with you, tell us what's working, what's not, or what you wish it did.
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
        </>)}
      </DialogContent>
    </Dialog>
  );
};
