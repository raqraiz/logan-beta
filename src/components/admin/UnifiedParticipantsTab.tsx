import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { 
  Users, RefreshCw, Search, Clock, MessageSquare, 
  AlertCircle, ChevronRight 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { CycleCircle } from "./CycleCircle";
import { ParticipantDetailPanel } from "./ParticipantDetailPanel";

interface ParticipantSummary {
  id: string;
  full_name: string;
  is_active: boolean;
  last_period_start: string | null;
  cycle_length_days: number | null;
  telegram_chat_id: string | null;
  anchor_symptom: string | null;
  lastActivity: string | null;
  pendingCount: number;
  unrepliedCount: number;
}

interface UnifiedParticipantsTabProps {
  userId: string;
}

export function UnifiedParticipantsTab({ userId }: UnifiedParticipantsTabProps) {
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchParticipants = async () => {
    setLoading(true);
    try {
      const [participantsRes, insightsRes, feedbackRes, updatesRes] = await Promise.all([
        supabase.from("participants").select("id, full_name, is_active, last_period_start, cycle_length_days, telegram_chat_id, anchor_symptom").order("full_name"),
        supabase.from("insights").select("participant_id, status, created_at"),
        supabase.from("feedback").select("participant_id, admin_reply, created_at"),
        supabase.from("cycle_updates").select("participant_id, created_at"),
      ]);

      if (participantsRes.error) throw participantsRes.error;

      const summaries: ParticipantSummary[] = (participantsRes.data || []).map((p) => {
        const pInsights = insightsRes.data?.filter(i => i.participant_id === p.id) || [];
        const pFeedback = feedbackRes.data?.filter(f => f.participant_id === p.id) || [];
        const pUpdates = updatesRes.data?.filter(u => u.participant_id === p.id) || [];

        // Count pending insights
        const pendingCount = pInsights.filter(i => i.status === "pending").length;
        
        // Count unreplied feedback
        const unrepliedCount = pFeedback.filter(f => !f.admin_reply).length;

        // Last activity
        const allTimestamps = [
          ...pInsights.map(i => i.created_at),
          ...pFeedback.map(f => f.created_at),
          ...pUpdates.map(u => u.created_at),
        ].filter(Boolean);

        const lastActivity = allTimestamps.length
          ? allTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
          : null;

        return {
          id: p.id,
          full_name: p.full_name,
          is_active: p.is_active,
          last_period_start: p.last_period_start,
          cycle_length_days: p.cycle_length_days,
          telegram_chat_id: p.telegram_chat_id,
          anchor_symptom: p.anchor_symptom,
          lastActivity,
          pendingCount,
          unrepliedCount,
        };
      });

      // Sort: prioritize those with pending items, then by last activity
      summaries.sort((a, b) => {
        const aUrgent = a.pendingCount + a.unrepliedCount;
        const bUrgent = b.pendingCount + b.unrepliedCount;
        if (aUrgent > 0 && bUrgent === 0) return -1;
        if (bUrgent > 0 && aUrgent === 0) return 1;
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
      });

      setParticipants(summaries);
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error loading participants", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  const filtered = participants.filter(p =>
    p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // If a participant is selected, show the detail panel
  if (selectedId) {
    return (
      <div className="space-y-4">
        {/* Mobile: Back button to show all participants */}
        <div className="lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedId(null)}
            className="gap-2"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            All Participants ({participants.length})
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[600px]">
          {/* Left: Participant list (collapsed on mobile) */}
          <div className="hidden lg:block border rounded-lg overflow-hidden">
            <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
              <span className="font-medium text-sm">{participants.length} Participants</span>
              <Button variant="ghost" size="sm" onClick={fetchParticipants}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "px-3 py-2 cursor-pointer border-b transition-colors flex items-center gap-3",
                    selectedId === p.id ? "bg-primary/10" : "hover:bg-muted/50"
                  )}
                >
                  <CycleCircle 
                    lastPeriodStart={p.last_period_start} 
                    cycleLengthDays={p.cycle_length_days}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate text-sm">{p.full_name}</span>
                      {(p.pendingCount > 0 || p.unrepliedCount > 0) && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                      )}
                    </div>
                    {p.lastActivity && (
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(p.lastActivity), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detail panel */}
          <div className="lg:col-span-2 border rounded-lg overflow-hidden">
            <ParticipantDetailPanel
              participantId={selectedId}
              userId={userId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      </div>
    );
  }

  // Default: Full participant list view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <span className="font-medium">{participants.length} Participants</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchParticipants}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Participant Cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No participants found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted/50",
                !p.is_active && "opacity-60"
              )}
              onClick={() => setSelectedId(p.id)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-4">
                  <CycleCircle 
                    lastPeriodStart={p.last_period_start} 
                    cycleLengthDays={p.cycle_length_days}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{p.full_name}</span>
                      {!p.is_active && <Badge variant="secondary">Inactive</Badge>}
                      {!p.telegram_chat_id && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Not connected
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {p.anchor_symptom && (
                        <span className="truncate">🎯 {p.anchor_symptom}</span>
                      )}
                      {p.lastActivity && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(p.lastActivity), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Urgent indicators */}
                  <div className="flex items-center gap-2">
                    {p.pendingCount > 0 && (
                      <Badge className="bg-amber-500 hover:bg-amber-600">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {p.pendingCount} pending
                      </Badge>
                    )}
                    {p.unrepliedCount > 0 && (
                      <Badge variant="outline" className="border-primary text-primary">
                        <MessageSquare className="w-3 h-3 mr-1" />
                        {p.unrepliedCount} unreplied
                      </Badge>
                    )}
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
