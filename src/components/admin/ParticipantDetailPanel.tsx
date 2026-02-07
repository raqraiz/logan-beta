import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { 
  RefreshCw, Send, Sparkles, Wand2, Check, X, 
  MessageSquare, Calendar, Target, ThumbsUp, ThumbsDown, Reply,
  Plus, Clock, User
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { CycleCircle } from "./CycleCircle";

interface Participant {
  id: string;
  full_name: string;
  whatsapp_number: string;
  telegram_chat_id: string | null;
  preferred_channel: string | null;
  email: string | null;
  age: number | null;
  cycle_length_days: number | null;
  cycle_regularity: string | null;
  last_period_start: string | null;
  anchor_symptom: string | null;
  typical_symptoms: string[] | null;
  goals: string[] | null;
  timezone: string | null;
  is_active: boolean;
}

interface Insight {
  id: string;
  created_at: string;
  content: string;
  insight_type: string | null;
  status: "pending" | "approved" | "rejected" | "sent";
  sent_at: string | null;
}

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
    feedback_id?: string;
    insight_id?: string;
  };
}

interface ParticipantDetailPanelProps {
  participantId: string;
  userId: string;
  onClose: () => void;
}

export function ParticipantDetailPanel({ 
  participantId, 
  userId,
  onClose 
}: ParticipantDetailPanelProps) {
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [pendingInsights, setPendingInsights] = useState<Insight[]>([]);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("conversation");
  
  // New insight creation
  const [insightType, setInsightType] = useState("awareness");
  const [insightContent, setInsightContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  
  // Sending insight state
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [participantRes, insightsRes, feedbackRes, updatesRes] = await Promise.all([
        supabase.from("participants").select("*").eq("id", participantId).single(),
        supabase.from("insights").select("*").eq("participant_id", participantId).order("created_at", { ascending: true }),
        supabase.from("feedback").select("*").eq("participant_id", participantId).order("created_at", { ascending: true }),
        supabase.from("cycle_updates").select("*").eq("participant_id", participantId).order("created_at", { ascending: true }),
      ]);

      if (participantRes.error) throw participantRes.error;
      setParticipant(participantRes.data);

      // Build thread
      const threadItems: ThreadItem[] = [];
      
      insightsRes.data?.forEach((insight) => {
        threadItems.push({
          id: insight.id,
          type: "insight",
          timestamp: insight.sent_at || insight.created_at,
          content: insight.content,
          metadata: {
            status: insight.status,
            insight_type: insight.insight_type,
            insight_id: insight.id,
          },
        });
      });

      feedbackRes.data?.forEach((fb) => {
        if (fb.free_form_text || fb.emoji_reaction || fb.is_useful !== null) {
          threadItems.push({
            id: `fb-${fb.id}`,
            type: "feedback",
            timestamp: fb.created_at,
            content: fb.free_form_text || "",
            metadata: {
              emoji_reaction: fb.emoji_reaction,
              is_useful: fb.is_useful,
              feedback_id: fb.id,
            },
          });
        }

        if (fb.admin_reply) {
          threadItems.push({
            id: `reply-${fb.id}`,
            type: "admin_reply",
            timestamp: fb.admin_reply_at || fb.created_at,
            content: fb.admin_reply,
          });
        }
      });

      updatesRes.data?.forEach((update) => {
        threadItems.push({
          id: update.id,
          type: "cycle_update",
          timestamp: update.created_at,
          content: update.description,
        });
      });

      threadItems.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      setThread(threadItems);

      // Only show pending insights in the queue (approved ones are now auto-sent)
      const pending = insightsRes.data?.filter(i => i.status === "pending") || [];
      setPendingInsights(pending);
      setPendingInsights(pending);

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error loading participant", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [participantId]);

  const generateInsight = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-insight", {
        body: { participantId, insightType },
      });
      if (error) throw error;
      setInsightContent(data.content);
      toast({ title: "Insight generated" });
    } catch (error) {
      toast({ title: "Failed to generate", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const createInsight = async () => {
    if (!insightContent.trim()) return;
    setIsCreating(true);
    try {
      const { error } = await supabase.from("insights").insert({
        participant_id: participantId,
        content: insightContent,
        insight_type: insightType,
        status: "pending",
      });
      if (error) throw error;
      toast({ title: "Insight created" });
      setInsightContent("");
      fetchData();
    } catch (error) {
      toast({ title: "Failed to create", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const approveAndSendInsight = async (id: string) => {
    if (sendingId) return;
    setSendingId(id);
    try {
      // First approve the insight
      await supabase.from("insights").update({
        status: "approved",
        approved_by: userId,
        approved_at: new Date().toISOString(),
      }).eq("id", id);

      // Then immediately send via Telegram
      const { data, error } = await supabase.functions.invoke("send-telegram", {
        body: { insightId: id },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Approved & sent" });
      fetchData();
    } catch {
      toast({ title: "Failed to approve & send", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const rejectInsight = async (id: string) => {
    try {
      await supabase.from("insights").update({ status: "rejected" }).eq("id", id);
      toast({ title: "Rejected" });
      fetchData();
    } catch {
      toast({ title: "Failed to reject", variant: "destructive" });
    }
  };

  const generateReply = async (feedbackId: string) => {
    setIsGeneratingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: { feedbackId },
      });
      if (error) throw error;
      setReplyText(data.content);
      toast({ title: "Reply generated" });
    } catch {
      toast({ title: "Failed to generate reply", variant: "destructive" });
    } finally {
      setIsGeneratingReply(false);
    }
  };

  const sendReply = async (feedbackId: string) => {
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    try {
      await supabase.from("feedback").update({
        admin_reply: replyText.trim(),
        admin_reply_at: new Date().toISOString(),
        admin_reply_sent: false,
      }).eq("id", feedbackId);

      if (participant?.preferred_channel === "telegram" && participant?.telegram_chat_id) {
        const { error } = await supabase.functions.invoke("send-reply-telegram", {
          body: {
            chatId: participant.telegram_chat_id,
            message: replyText.trim(),
            feedbackId,
          },
        });
        if (error) throw error;
        toast({ title: "Reply sent via Telegram" });
      } else {
        toast({ title: "Reply saved" });
      }
      setReplyText("");
      setReplyingTo(null);
      fetchData();
    } catch {
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setIsSendingReply(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Participant not found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with participant profile summary */}
      <div className="border-b p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CycleCircle 
              lastPeriodStart={participant.last_period_start} 
              cycleLengthDays={participant.cycle_length_days}
              size="md"
            />
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {participant.full_name}
                <Badge variant={participant.is_active ? "default" : "secondary"}>
                  {participant.is_active ? "Active" : "Inactive"}
                </Badge>
              </h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                {participant.age && <span>Age {participant.age}</span>}
                {participant.cycle_length_days && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {participant.cycle_length_days}-day cycle
                  </span>
                )}
                {participant.telegram_chat_id && (
                  <Badge variant="outline" className="text-xs">📱 Telegram connected</Badge>
                )}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Symptoms & Goals */}
        {(participant.typical_symptoms?.length || participant.goals?.length || participant.anchor_symptom) && (
          <div className="flex flex-wrap gap-2">
            {participant.anchor_symptom && (
              <Badge variant="default" className="text-xs">
                🎯 {participant.anchor_symptom}
              </Badge>
            )}
            {participant.typical_symptoms?.slice(0, 3).map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
            ))}
            {participant.typical_symptoms && participant.typical_symptoms.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{participant.typical_symptoms.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {/* Pending approval indicator */}
        {pendingInsights.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
              {pendingInsights.length} pending approval
            </Badge>
          </div>
        )}
      </div>

      {/* Tabs for Conversation / Create / Queue */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-4 grid grid-cols-3">
          <TabsTrigger value="conversation" className="gap-1">
            <MessageSquare className="w-4 h-4" />
            Conversation
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1">
            <Plus className="w-4 h-4" />
            Create
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1 relative">
            <Clock className="w-4 h-4" />
            Queue
            {pendingInsights.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {pendingInsights.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Conversation Thread */}
        <TabsContent value="conversation" className="flex-1 overflow-y-auto px-4 pb-4 mt-4">
          {thread.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No conversation history yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {thread.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg p-3",
                      item.type === "insight" || item.type === "admin_reply"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs opacity-70">
                        {item.type === "insight" && "Insight"}
                        {item.type === "admin_reply" && "Your reply"}
                        {item.type === "feedback" && "Response"}
                        {item.type === "cycle_update" && "Message"}
                      </span>
                      {item.metadata?.insight_type && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary-foreground/20">
                          {item.metadata.insight_type}
                        </Badge>
                      )}
                      {item.metadata?.status === "pending" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Pending</Badge>
                      )}
                    </div>

                    {item.type === "feedback" && item.metadata?.emoji_reaction && (
                      <span className="text-2xl">{item.metadata.emoji_reaction}</span>
                    )}
                    {item.type === "feedback" && item.metadata?.is_useful !== null && (
                      <Badge variant={item.metadata.is_useful ? "default" : "secondary"} className="text-xs mr-2">
                        {item.metadata.is_useful ? <ThumbsUp className="w-3 h-3 mr-1" /> : <ThumbsDown className="w-3 h-3 mr-1" />}
                        {item.metadata.is_useful ? "Useful" : "Not useful"}
                      </Badge>
                    )}

                    {item.content && (
                      <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                    )}

                    <p className="text-[10px] opacity-60 mt-2">
                      {format(new Date(item.timestamp), "MMM d, h:mm a")}
                    </p>
                  </div>

                  {/* Reply button for feedback */}
                  {item.type === "feedback" && item.metadata?.feedback_id && (
                    <div className="mr-auto">
                      {replyingTo === item.metadata.feedback_id ? (
                        <div className="max-w-[85%] space-y-2 p-3 rounded-lg border bg-card">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Reply</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => generateReply(item.metadata!.feedback_id!)}
                              disabled={isGeneratingReply}
                            >
                              {isGeneratingReply ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              <span className="ml-1">AI</span>
                            </Button>
                          </div>
                          <Textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            className="min-h-[60px] text-sm"
                          />
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setReplyText(""); }}>
                              Cancel
                            </Button>
                            <Button size="sm" onClick={() => sendReply(item.metadata!.feedback_id!)} disabled={isSendingReply || !replyText.trim()}>
                              {isSendingReply ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              <span className="ml-1">Send</span>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setReplyingTo(item.metadata!.feedback_id!)} className="text-xs">
                          <Reply className="w-3 h-3 mr-1" /> Reply
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Create New Insight */}
        <TabsContent value="create" className="flex-1 overflow-y-auto px-4 pb-4 mt-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Type</label>
              <Select value={insightType} onValueChange={setInsightType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="awareness">🌙 Awareness</SelectItem>
                  <SelectItem value="pattern">🔍 Pattern</SelectItem>
                  <SelectItem value="validation">💜 Validation</SelectItem>
                  <SelectItem value="action">⚡ Action</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {insightType === "awareness" && "Phase education — what's happening in their body"}
                {insightType === "pattern" && "Personal pattern observation"}
                {insightType === "validation" && "Emotional support and normalization"}
                {insightType === "action" && "Specific recommendation based on data"}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Content</label>
                <Button variant="outline" size="sm" onClick={generateInsight} disabled={isGenerating}>
                  {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                  AI Generate
                </Button>
              </div>
              <Textarea
                value={insightContent}
                onChange={(e) => setInsightContent(e.target.value)}
                placeholder="Write a personalized insight..."
                className="min-h-[150px]"
              />
            </div>

            <Button onClick={createInsight} disabled={isCreating || !insightContent.trim()} className="w-full">
              {isCreating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Insight
            </Button>
          </div>
        </TabsContent>

        {/* Pending Queue */}
        <TabsContent value="queue" className="flex-1 overflow-y-auto px-4 pb-4 mt-4">
          {pendingInsights.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No pending insights</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingInsights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={insight.status === "pending" ? "outline" : "default"} className={cn(
                          "text-xs",
                          insight.status === "pending" && "bg-amber-500/10 text-amber-600 border-amber-500/30",
                          insight.status === "approved" && "bg-green-500/10 text-green-600 border-green-500/30"
                        )}>
                          {insight.status}
                        </Badge>
                        {insight.insight_type && (
                          <Badge variant="secondary" className="text-xs">{insight.insight_type}</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(insight.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap mb-4">{insight.content}</p>
                    <div className="flex gap-2 justify-end">
                      {insight.status === "pending" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => rejectInsight(insight.id)}>
                            <X className="w-4 h-4 mr-1" /> Reject
                          </Button>
                          <Button size="sm" onClick={() => approveAndSendInsight(insight.id)} disabled={sendingId === insight.id}>
                            {sendingId === insight.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <Send className="w-4 h-4 mr-1" />
                            )}
                            Approve & Send
                          </Button>
                        </>
                      )}
                      {insight.status === "approved" && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600">
                          Ready - click to resend if needed
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
