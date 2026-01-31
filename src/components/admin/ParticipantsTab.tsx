import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Users, RefreshCw, Phone, Calendar, Target, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { CycleCircle } from "./CycleCircle";

interface Participant {
  id: string;
  created_at: string;
  full_name: string;
  whatsapp_number: string;
  telegram_chat_id: string | null;
  preferred_channel: string | null;
  email: string | null;
  age: number | null;
  cycle_length_days: number | null;
  last_period_start: string | null;
  cycle_regularity: string | null;
  typical_symptoms: string[] | null;
  goals: string[] | null;
  is_active: boolean;
}

export function ParticipantsTab() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParticipants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setParticipants(data || []);
    } catch (error) {
      console.error("Error fetching participants:", error);
      toast({
        title: "Error",
        description: "Failed to load participants",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("participants")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      
      setParticipants(prev => 
        prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p)
      );
      
      toast({ title: currentStatus ? "Participant deactivated" : "Participant activated" });
    } catch (error) {
      console.error("Error updating participant:", error);
      toast({ title: "Error updating participant", variant: "destructive" });
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
          <Users className="w-5 h-5 text-primary" />
          <span className="font-medium">{participants.length} Participants</span>
        </div>
        <Button variant="outline" size="sm" onClick={fetchParticipants}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {participants.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No participants yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {participants.map((participant) => (
            <Card key={participant.id} className={!participant.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <CycleCircle 
                      lastPeriodStart={participant.last_period_start} 
                      cycleLengthDays={participant.cycle_length_days}
                      size="sm"
                    />
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {participant.full_name}
                        <Badge variant={participant.is_active ? "default" : "secondary"}>
                          {participant.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Joined {format(new Date(participant.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => toggleActive(participant.id, participant.is_active)}
                  >
                    {participant.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  {participant.preferred_channel && (
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={participant.preferred_channel === "telegram" ? "border-[#0088cc] text-[#0088cc]" : "border-green-500 text-green-500"}
                      >
                        {participant.preferred_channel === "telegram" ? "📱 Telegram" : "💬 WhatsApp"}
                      </Badge>
                    </div>
                  )}
                  {participant.telegram_chat_id && (
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-muted-foreground" />
                      <span className="truncate text-xs" title={participant.telegram_chat_id}>
                        {participant.telegram_chat_id}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{participant.whatsapp_number}</span>
                  </div>
                  {participant.cycle_length_days && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>{participant.cycle_length_days}-day cycle</span>
                    </div>
                  )}
                  {participant.cycle_regularity && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {participant.cycle_regularity.replace("_", " ")}
                      </Badge>
                    </div>
                  )}
                  {participant.age && (
                    <div className="text-muted-foreground">
                      Age: {participant.age}
                    </div>
                  )}
                </div>

                {(participant.typical_symptoms?.length || participant.goals?.length) && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {participant.typical_symptoms && participant.typical_symptoms.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Symptoms</p>
                        <div className="flex flex-wrap gap-1">
                          {participant.typical_symptoms.map((symptom) => (
                            <Badge key={symptom} variant="secondary" className="text-xs">
                              {symptom}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {participant.goals && participant.goals.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Goals</p>
                        <div className="flex flex-wrap gap-1">
                          {participant.goals.map((goal) => (
                            <Badge key={goal} variant="outline" className="text-xs">
                              <Target className="w-3 h-3 mr-1" />
                              {goal}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
