import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, RefreshCw, Search, ChevronRight, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface ParticipantThread {
  id: string;
  full_name: string;
  lastActivity: string;
  insightCount: number;
  feedbackCount: number;
  unrepliedCount: number;
  lastMessage?: string;
}

interface ParticipantThreadListProps {
  onSelectParticipant: (id: string, name: string) => void;
}

export function ParticipantThreadList({ onSelectParticipant }: ParticipantThreadListProps) {
  const [threads, setThreads] = useState<ParticipantThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchThreads = async () => {
    setLoading(true);
    try {
      // Get all participants
      const { data: participants, error: participantsError } = await supabase
        .from("participants")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");

      if (participantsError) throw participantsError;

      // Get insights count and last activity per participant
      const { data: insights, error: insightsError } = await supabase
        .from("insights")
        .select("participant_id, created_at, content, status");

      if (insightsError) throw insightsError;

      // Get feedback with unreplied count
      const { data: feedback, error: feedbackError } = await supabase
        .from("feedback")
        .select("participant_id, created_at, free_form_text, admin_reply");

      if (feedbackError) throw feedbackError;

      // Get cycle updates (incoming messages)
      const { data: updates, error: updatesError } = await supabase
        .from("cycle_updates")
        .select("participant_id, created_at, description");

      if (updatesError) throw updatesError;

      // Build thread summary for each participant
      const threadData: ParticipantThread[] = (participants || []).map((p) => {
        const participantInsights = insights?.filter((i) => i.participant_id === p.id) || [];
        const participantFeedback = feedback?.filter((f) => f.participant_id === p.id) || [];
        const participantUpdates = updates?.filter((u) => u.participant_id === p.id) || [];

        // Find unreplied feedback (has content but no admin_reply)
        const unreplied = participantFeedback.filter(
          (f) => (f.free_form_text || participantUpdates.length > 0) && !f.admin_reply
        );

        // Find latest activity timestamp
        const allTimestamps = [
          ...participantInsights.map((i) => i.created_at),
          ...participantFeedback.map((f) => f.created_at),
          ...participantUpdates.map((u) => u.created_at),
        ].filter(Boolean);

        const latestTimestamp = allTimestamps.length
          ? allTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
          : null;

        // Get last message preview
        const allMessages = [
          ...participantInsights.map((i) => ({ time: i.created_at, text: i.content, from: "logan" })),
          ...participantFeedback.filter(f => f.free_form_text).map((f) => ({ time: f.created_at, text: f.free_form_text, from: "user" })),
          ...participantUpdates.map((u) => ({ time: u.created_at, text: u.description, from: "user" })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        const lastMessage = allMessages[0];

        return {
          id: p.id,
          full_name: p.full_name,
          lastActivity: latestTimestamp || "",
          insightCount: participantInsights.length,
          feedbackCount: participantFeedback.length + participantUpdates.length,
          unrepliedCount: unreplied.length + participantUpdates.filter(u => {
            // Check if update has a corresponding reply
            return !participantFeedback.some(f => f.admin_reply);
          }).length,
          lastMessage: lastMessage?.text?.slice(0, 60) + (lastMessage?.text && lastMessage.text.length > 60 ? "..." : ""),
        };
      });

      // Sort by last activity (most recent first), then by unreplied count
      threadData.sort((a, b) => {
        // Prioritize unreplied
        if (a.unrepliedCount > 0 && b.unrepliedCount === 0) return -1;
        if (b.unrepliedCount > 0 && a.unrepliedCount === 0) return 1;
        // Then by last activity
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
      });

      setThreads(threadData);
    } catch (error) {
      console.error("Error fetching threads:", error);
      toast({ title: "Error loading conversations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, []);

  const filteredThreads = threads.filter((t) =>
    t.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Only show participants with some activity
  const activeThreads = filteredThreads.filter(
    (t) => t.insightCount > 0 || t.feedbackCount > 0
  );

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <span className="font-medium">{activeThreads.length} Conversations</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search participants..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchThreads}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Thread List */}
      {activeThreads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No conversations yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeThreads.map((thread) => (
            <Card
              key={thread.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onSelectParticipant(thread.id, thread.full_name)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{thread.full_name}</span>
                      {thread.unrepliedCount > 0 && (
                        <Badge variant="default" className="text-xs">
                          {thread.unrepliedCount} unreplied
                        </Badge>
                      )}
                    </div>
                    {thread.lastMessage && (
                      <p className="text-sm text-muted-foreground truncate">
                        {thread.lastMessage}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{thread.insightCount} insights</span>
                      <span>{thread.feedbackCount} responses</span>
                      {thread.lastActivity && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(thread.lastActivity), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
