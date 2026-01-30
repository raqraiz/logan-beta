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
import { Sparkles, RefreshCw, Check, X, Send, Plus, Wand2, Image } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { CycleCircle } from "./CycleCircle";

type CyclePhase = "Menstruation" | "Follicular" | "Ovulation" | "Luteal";

const phaseColors: Record<CyclePhase, { main: string }> = {
  Menstruation: { main: "#e11d48" },
  Follicular: { main: "#059669" },
  Ovulation: { main: "#d97706" },
  Luteal: { main: "#7c3aed" },
};

function getCycleInfo(lastPeriodStart: string | null, cycleLengthDays: number | null): { day: number; phase: CyclePhase } | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  const today = new Date();
  const periodStart = new Date(lastPeriodStart);
  const daysSinceStart = differenceInDays(today, periodStart);
  
  const currentDay = ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;

  const menstruationEnd = 5;
  const ovulationDay = cycleLengthDays - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;

  let phase: CyclePhase;

  if (currentDay <= menstruationEnd) {
    phase = "Menstruation";
  } else if (currentDay < ovulationStart) {
    phase = "Follicular";
  } else if (currentDay <= ovulationEnd) {
    phase = "Ovulation";
  } else {
    phase = "Luteal";
  }

  return { day: currentDay, phase };
}

function generateCycleImageUrl(lastPeriodStart: string | null, cycleLengthDays: number | null): string | null {
  const cycleInfo = getCycleInfo(lastPeriodStart, cycleLengthDays);
  if (!cycleInfo) return null;

  const { day, phase } = cycleInfo;
  const colors = phaseColors[phase];
  const cycleLength = cycleLengthDays || 28;
  
  // Use day / remaining days ratio (not percentage) to match edge function
  const progress = day;
  const remaining = cycleLength - day;

  // IMPORTANT: QuickChart URL mode (?c=...) expects a Chart.js config object.
  // Do NOT send the POST wrapper object (e.g., { chart, width, height, backgroundColor }).
  const chartConfig = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [progress, remaining],
          // Match dark track seen in CycleCircle
          backgroundColor: [colors.main, "#3E4348"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      cutoutPercentage: 70,
      // Start from top (equivalent to -90deg)
      rotation: 4.71238898038469,
      circumference: 6.283185307179586,
      legend: { display: false },
      plugins: {
        // QuickChart registers chartjs-plugin-datalabels by default; disable it to avoid
        // showing the dataset values (e.g., 21/78) on the chart.
        datalabels: { display: false },
        doughnutlabel: {
          labels: [
            {
              text: day.toString(),
              font: { size: 52, weight: "bold" },
              color: colors.main,
            },
          ],
        },
      },
      // Put phase label below the ring (like CycleCircle)
      title: {
        display: true,
        text: phase,
        position: "bottom",
        fontSize: 18,
        fontColor: colors.main,
        padding: 16,
      },
    },
  };

  // Use POST endpoint via URL with base64 encoded config for preview
  const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
  // Dark background to match app UI (hex needs %23 prefix for QuickChart)
  // Use graphite (not pure black) so the ring + center read clearly
  return `https://quickchart.io/chart?c=${encodedConfig}&v=2.9.4&w=300&h=350&bkg=%231C1E22`;
}

interface ParticipantBasic {
  id: string;
  full_name: string;
  whatsapp_number: string;
}

interface ParticipantFull extends ParticipantBasic {
  email: string | null;
  age: number | null;
  cycle_length_days: number | null;
  cycle_regularity: string | null;
  last_period_start: string | null;
  anchor_symptom: string | null;
  typical_symptoms: string[] | null;
  goals: string[] | null;
  timezone: string | null;
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
  participants?: ParticipantBasic;
}

interface InsightsTabProps {
  userId: string;
}

export function InsightsTab({ userId }: InsightsTabProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [participants, setParticipants] = useState<ParticipantFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewParticipantId, setPreviewParticipantId] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<string>("");
  const [insightType, setInsightType] = useState<string>("awareness");
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
          .select("id, full_name, whatsapp_number, email, age, cycle_length_days, cycle_regularity, last_period_start, anchor_symptom, typical_symptoms, goals, timezone")
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
    if (sendingId) return; // Prevent double-clicks
    
    setSendingId(insight.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { insightId: insight.id },
      });

      if (error) throw error;
      
      if (data?.error) {
        toast({ 
          title: data.error, 
          description: data.currentStatus ? `Current status: ${data.currentStatus}` : undefined,
          variant: "destructive" 
        });
        return;
      }

      setInsights(prev =>
        prev.map(i => (i.id === insight.id ? { ...i, status: "sent" as const } : i))
      );

      toast({ title: "Message sent via WhatsApp! 📱" });
    } catch (error) {
      console.error("Error sending WhatsApp:", error);
      toast({ title: "Failed to send WhatsApp message", variant: "destructive" });
    } finally {
      setSendingId(null);
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
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Create New Insight</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 overflow-y-auto max-h-[70vh]">
                {/* Left side: Form */}
                <div className="space-y-4">
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
                        <SelectItem value="awareness">🌙 Awareness</SelectItem>
                        <SelectItem value="pattern">🔍 Pattern</SelectItem>
                        <SelectItem value="validation">💜 Validation</SelectItem>
                        <SelectItem value="action">⚡ Action</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {insightType === "awareness" && "Phase education — what's happening in their body right now"}
                      {insightType === "pattern" && "Personal pattern — \"We noticed X happens for you during Y\""}
                      {insightType === "validation" && "Emotional support — normalizing their experience"}
                      {insightType === "action" && "Specific recommendation — based on their data and patterns"}
                    </p>
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
                      rows={8}
                    />
                  </div>
                </div>

                {/* Right side: Participant Profile */}
                <div className="space-y-4 border-l pl-6">
                  <Label className="text-base font-semibold">Participant Profile</Label>
                  {selectedParticipant ? (
                    (() => {
                      const p = participants.find(p => p.id === selectedParticipant);
                      if (!p) return <p className="text-sm text-muted-foreground">Participant not found</p>;
                      return (
                        <div className="space-y-3 text-sm">
                          {/* Cycle Circle at top for quick reference */}
                          <div className="flex items-center gap-4 pb-3 border-b">
                            <CycleCircle 
                              lastPeriodStart={p.last_period_start} 
                              cycleLengthDays={p.cycle_length_days}
                              size="md"
                            />
                            <div className="flex-1">
                              <p className="font-medium">{p.full_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.cycle_length_days || 28} day cycle
                              </p>
                              {p.last_period_start && (
                                <p className="text-xs text-muted-foreground">
                                  Last period: {format(new Date(p.last_period_start), "MMM d")}
                                </p>
                              )}
                            </div>
                            {p.last_period_start && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setPreviewParticipantId(p.id);
                                  setShowImagePreview(true);
                                }}
                              >
                                <Image className="w-4 h-4 mr-1" />
                                Preview
                              </Button>
                            )}
                          </div>
                          
                          <div>
                            <span className="font-medium text-muted-foreground">WhatsApp:</span>
                            <p>{p.whatsapp_number}</p>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">WhatsApp:</span>
                            <p>{p.whatsapp_number}</p>
                          </div>
                          {p.email && (
                            <div>
                              <span className="font-medium text-muted-foreground">Email:</span>
                              <p>{p.email}</p>
                            </div>
                          )}
                          {p.age && (
                            <div>
                              <span className="font-medium text-muted-foreground">Age:</span>
                              <p>{p.age}</p>
                            </div>
                          )}
                          <div className="border-t pt-3">
                            <span className="font-medium text-muted-foreground">Cycle Info:</span>
                            <div className="mt-1 space-y-1">
                              <p>Length: {p.cycle_length_days || 28} days</p>
                              <p>Regularity: {p.cycle_regularity || "Not specified"}</p>
                              {p.last_period_start && (
                                <p>Last period: {format(new Date(p.last_period_start), "MMM d, yyyy")}</p>
                              )}
                            </div>
                          </div>
                          {p.anchor_symptom && (
                            <div className="border-t pt-3">
                              <span className="font-medium text-muted-foreground">Anchor Symptom:</span>
                              <p className="mt-1">{p.anchor_symptom}</p>
                            </div>
                          )}
                          {p.typical_symptoms && p.typical_symptoms.length > 0 && (
                            <div className="border-t pt-3">
                              <span className="font-medium text-muted-foreground">Typical Symptoms:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {p.typical_symptoms.map((s, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {p.goals && p.goals.length > 0 && (
                            <div className="border-t pt-3">
                              <span className="font-medium text-muted-foreground">Goals:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {p.goals.map((g, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">{g}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {p.timezone && (
                            <div className="border-t pt-3">
                              <span className="font-medium text-muted-foreground">Timezone:</span>
                              <p>{p.timezone}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Select a participant to view their profile
                    </p>
                  )}
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
                          {insight.insight_type === "awareness" && "🌙 "}
                          {insight.insight_type === "pattern" && "🔍 "}
                          {insight.insight_type === "validation" && "💜 "}
                          {insight.insight_type === "action" && "⚡ "}
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
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviewParticipantId(insight.participant_id);
                          setShowImagePreview(true);
                        }}
                      >
                        <Image className="w-4 h-4 mr-1" />
                        Preview Image
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => sendToWhatsApp(insight)}
                        disabled={sendingId === insight.id}
                      >
                        <Send className="w-4 h-4 mr-1" />
                        {sendingId === insight.id ? "Sending..." : "Send to WhatsApp"}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cycle Image Preview Dialog */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>WhatsApp Cycle Image Preview</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {(() => {
              const participant = participants.find(p => p.id === previewParticipantId);
              if (!participant) return <p className="text-muted-foreground">Participant not found</p>;
              
              const imageUrl = generateCycleImageUrl(participant.last_period_start, participant.cycle_length_days);
              const cycleInfo = getCycleInfo(participant.last_period_start, participant.cycle_length_days);
              
              if (!imageUrl || !cycleInfo) {
                return <p className="text-muted-foreground">No cycle data available</p>;
              }
              
              return (
                <>
                  <p className="text-sm text-muted-foreground text-center">
                    This is the image that will be sent with the WhatsApp message for <strong>{participant.full_name}</strong>
                  </p>
                  <div className="rounded-lg p-4 bg-card border border-border shadow-card">
                    <img 
                      src={imageUrl} 
                      alt={`Cycle day ${cycleInfo.day} - ${cycleInfo.phase}`}
                      className="w-[300px] h-[350px]"
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">Day {cycleInfo.day} of {participant.cycle_length_days || 28}</p>
                    <p className="text-sm text-muted-foreground">{cycleInfo.phase} Phase</p>
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImagePreview(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
