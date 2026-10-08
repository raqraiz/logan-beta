import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

interface TeamMessage {
  id: string;
  body: string;
  kind: string | null;
  created_at: string;
  read_at: string | null;
}

const labelFor = (kind: string | null) =>
  kind === "feedback_reply" ? "Reply to your feedback"
    : kind === "thank_you" ? "A thank-you from the Logan team"
    : "Message from the Logan team";

/** Her private inbox of notes from the Logan team. Never part of the chat. */
export function useTeamInbox(userId: string | undefined) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    // Quiet on failure: no dot, empty inbox.
    const { data, error } = await supabase
      .from("team_messages")
      .select("id, body, kind, created_at, read_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!error) setMessages((data as TeamMessage[]) ?? []);
  }, [userId]);

  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return { messages, reload: load, hasUnread: messages.some((m) => !m.read_at) };
}

interface TeamInboxButtonProps {
  hasUnread: boolean;
  onClick: () => void;
}

export const TeamInboxButton = ({ hasUnread, onClick }: TeamInboxButtonProps) => (
  <Button
    variant="ghost"
    size="sm"
    onClick={onClick}
    aria-label={hasUnread ? "Messages from the Logan team, unread" : "Messages from the Logan team"}
    title="From the Logan team"
    className="relative"
  >
    <Mail className="w-4 h-4" />
    {hasUnread && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" aria-hidden="true" />}
  </Button>
);

interface TeamInboxSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: TeamMessage[];
  onOpened: () => void;
  onSendFeedback: () => void;
}

export const TeamInboxSheet = ({ open, onOpenChange, messages, onOpened, onSendFeedback }: TeamInboxSheetProps) => {
  // Unread ones keep their "new" look while the sheet is open; they are marked read as it opens.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const unread = messages.filter((m) => !m.read_at).map((m) => m.id);
    setNewIds(new Set(unread));
    if (unread.length === 0) return;
    (async () => {
      const { error } = await supabase.rpc("mark_team_messages_read");
      if (!error) onOpened();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>From the Logan team</SheetTitle>
          <SheetDescription className="sr-only">Messages from the Logan team</SheetDescription>
        </SheetHeader>

        <div className="mt-4">
          <Button variant="outline" size="sm" className="rounded-full" onClick={onSendFeedback}>
            Send feedback
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Messages from the Logan team will show up here.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-2xl px-4 py-3 bg-card text-card-foreground border ${newIds.has(m.id) ? "border-primary/40" : "border-border"}`}
              >
                <p className="mb-1 text-xs font-semibold text-primary">{labelFor(m.kind)}</p>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{format(new Date(m.created_at), "d MMM yyyy")}</p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
