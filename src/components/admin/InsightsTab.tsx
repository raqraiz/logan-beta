import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Sparkles, RefreshCw, Check, X, Send, Plus, Wand2 } from "lucide-react";
import { format } from "date-fns";

interface Participant {
  id: string;
  full_name: string;
  whatsapp_number: string;
}

interface Insight {
  id: string;
  created_at: string;
  participant_id: string;
  content: string;
  insight_type: string | null;
  status: "pending" | "approved" | "rejected" | "sent";
  scheduled_for: string | null;
  admin_notes: string | null;
  participants?: Participant;
}

interface InsightsTabProps {
  userId: string;
}

export function InsightsTab({ userId }: InsightsTabProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<string>("");
  const [insightType, setInsightType] = useState<string>("recommendation");
  const [insightContent, setInsightContent] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [insightsRes, participantsRes] = await Promise.all([
        supabase
          .from("insights")
          .select("*, participants(id, full_name, whatsapp_number)")
          .order("created_at", { ascending: false }),
        supabase
          .from("participants")
          .select("id, full_name, whatsapp_number")
          .eq("is_active", true),
      ]);

      if (insightsRes.error) throw insightsRes.error;
      if (participantsRes.error) throw participantsRes.error;

      setInsights(insightsRes.data || []);
      setParticipants(participantsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error loading data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateInsight = async () => {
    if (!selectedParticipant) {
      toast({ title: "Please select a participant", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-insight", {
        body: { participantId: selectedParticipant, insightType },
      });

      if (error) throw error;

      setInsightContent(data.content);
      toast({ title: "Insight generated! Review and approve." });
    } catch (error) {
      console.error("Error generating insight:", error);
      toast({ title: "Failed to generate insight", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const createInsight = async () => {
    if (!selectedParticipant || !insightContent.trim()) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from("insights").insert({
        participant_id: selectedParticipant,
        content: insightContent,
        insight_type: insightType,
        status: "pending",
      });

      if (error) throw error;

      toast({ title: "Insight created and pending approval" });
      setShowCreateDialog(false);
      setInsightContent("");
      setSelectedParticipant("");
      fetchData();
    } catch (error) {
      console.error("Error creating insight:", error);
      toast({ title: "Failed to create insight", variant: "destructive" });
    }
  };

  const updateInsightStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      const updateData: Record<string, unknown> = { status };
      if (status === "approved") {
        updateData.approved_by = userId;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("insights")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      setInsights(prev =>
        prev.map(i => (i.id === id ? { ...i, status } : i))
      );

      toast({ title: status === "approved" ? "Insight approved! ✅" : "Insight rejected" });
    } catch (error) {
      console.error("Error updating insight:", error);
      toast({ title: "Error updating insight", variant: "destructive" });
    }
  };

  const sendToWhatsApp = async (insight: Insight) => {
    try {
      const { error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          insightId: insight.id,
          phoneNumber: insight.participants?.whatsapp_number,
          message: insight.content,
        },
      });

      if (error) throw error;

      await supabase
        .from("insights")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", insight.id);

      setInsights(prev =>
        prev.map(i => (i.id === insight.id ? { ...i, status: "sent" as const } : i))
      );

      toast({ title: "Message sent via WhatsApp! 📱" });
    } catch (error) {
      console.error("Error sending WhatsApp:", error);
      toast({ title: "Failed to send WhatsApp message", variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "approved": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      case "sent": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="font-medium">{insights.length} Insights</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Create Insight
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Insight</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Participant</Label>
                  <Select value={selectedParticipant} onValueChange={setSelectedParticipant}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select participant" />
                    </SelectTrigger>
                    <SelectContent>
                      {participants.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name} ({p.whatsapp_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={insightType} onValueChange={setInsightType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prediction">Prediction</SelectItem>
                      <SelectItem value="recommendation">Recommendation</SelectItem>
                      <SelectItem value="check_in">Check-in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Content</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={generateInsight}
                      disabled={!selectedParticipant || generating}
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      {generating ? "Generating..." : "AI Generate"}
                    </Button>
                  </div>
                  <Textarea
                    value={insightContent}
                    onChange={(e) => setInsightContent(e.target.value)}
                    placeholder="Write a personalized insight for this participant..."
                    rows={6}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={createInsight}>
                  Create Insight
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {insights.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No insights yet. Create one above!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <Card key={insight.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {insight.participants?.full_name || "Unknown"}
                      <Badge className={getStatusColor(insight.status)}>
                        {insight.status}
                      </Badge>
                      {insight.insight_type && (
                        <Badge variant="outline" className="capitalize">
                          {insight.insight_type.replace("_", " ")}
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {format(new Date(insight.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap mb-4">{insight.content}</p>

                <div className="flex flex-wrap gap-2">
                  {insight.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => updateInsightStatus(insight.id, "approved")}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateInsightStatus(insight.id, "rejected")}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  {insight.status === "approved" && insight.participants?.whatsapp_number && (
                    <Button size="sm" onClick={() => sendToWhatsApp(insight)}>
                      <Send className="w-4 h-4 mr-1" />
                      Send to WhatsApp
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
