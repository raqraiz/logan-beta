import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { 
  Users, RefreshCw, Search, Mail, Phone, Calendar, ChevronRight, 
  ChevronLeft, Trash2, Loader2, Activity, Target, Clock, MessageSquare
} from "lucide-react";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
import { cn } from "@/lib/utils";
import { Json } from "@/integrations/supabase/types";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationPreference {
  user_id: string;
  frequency: string;
  preferred_time: string;
  preferred_days: string[] | null;
  timezone: string;
  is_enabled: boolean;
}

interface Participant {
  id: string;
  email: string | null;
  full_name: string;
  last_period_start: string | null;
  cycle_length_days: number | null;
  cycle_regularity: string | null;
  typical_symptoms: string[] | null;
  anchor_symptom: string | null;
  goals: string[] | null;
  timezone: string | null;
  is_active: boolean | null;
  created_at: string;
}

interface Insight {
  id: string;
  participant_id: string;
  content: string;
  status: string | null;
  insight_type: string | null;
  created_at: string;
  sent_at: string | null;
}

interface ChatMessage {
  id: string;
  user_id: string;
  role: string;
  content: string;
  message_type: string | null;
  emoji_reaction: string | null;
  metadata: Json | null;
  created_at: string;
}

interface MessageMetadata {
  has_cycle_visual?: boolean;
  cycle_day?: number;
  cycle_phase?: string;
  cycle_length_days?: number;
  [key: string]: unknown;
}

interface ProfileWithData extends Profile {
  notificationPrefs?: NotificationPreference;
  participant?: Participant;
  insights?: Insight[];
  messageCount?: number;
}

export function ProfilesTab() {
  const [profiles, setProfiles] = useState<ProfileWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<ProfileWithData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch notification preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from("notification_preferences")
        .select("*");

      if (prefsError) throw prefsError;

      // Fetch participants (by email match)
      const { data: participantsData, error: participantsError } = await supabase
        .from("participants")
        .select("*");

      if (participantsError) throw participantsError;

      // Fetch insights
      const { data: insightsData, error: insightsError } = await supabase
        .from("insights")
        .select("*")
        .order("created_at", { ascending: false });

      if (insightsError) throw insightsError;

      // Fetch message counts
      const { data: messagesData, error: messagesError } = await supabase
        .from("chat_messages")
        .select("user_id");

      if (messagesError) throw messagesError;

      // Build maps
      const prefsMap = new Map<string, NotificationPreference>();
      prefsData?.forEach(pref => prefsMap.set(pref.user_id, pref));

      const participantsByEmail = new Map<string, Participant>();
      participantsData?.forEach(p => {
        if (p.email) participantsByEmail.set(p.email.toLowerCase(), p);
      });

      const insightsByParticipant = new Map<string, Insight[]>();
      insightsData?.forEach(insight => {
        const existing = insightsByParticipant.get(insight.participant_id) || [];
        existing.push(insight);
        insightsByParticipant.set(insight.participant_id, existing);
      });

      const messageCountByUser = new Map<string, number>();
      messagesData?.forEach(msg => {
        messageCountByUser.set(msg.user_id, (messageCountByUser.get(msg.user_id) || 0) + 1);
      });

      // Combine data
      const enrichedProfiles: ProfileWithData[] = (profilesData || []).map(profile => {
        const participant = participantsByEmail.get(profile.email.toLowerCase());
        return {
          ...profile,
          notificationPrefs: prefsMap.get(profile.id),
          participant,
          insights: participant ? insightsByParticipant.get(participant.id) : undefined,
          messageCount: messageCountByUser.get(profile.id) || 0,
        };
      });

      setProfiles(enrichedProfiles);
    } catch (error) {
      console.error("Error:", error);
      toast({ title: "Error loading profiles", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteUser = async (userId: string, userName: string) => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "User deleted successfully" });
      setSelectedProfile(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({ 
        title: "Error deleting user", 
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive" 
      });
    } finally {
      setDeleting(false);
    }
  };

  const fetchChatMessages = async (userId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setChatMessages(data || []);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({ title: "Error loading messages", variant: "destructive" });
    } finally {
      setLoadingMessages(false);
    }
  };

  // Fetch messages when profile is selected
  useEffect(() => {
    if (selectedProfile) {
      fetchChatMessages(selectedProfile.id);
    } else {
      setChatMessages([]);
    }
  }, [selectedProfile?.id]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const calculateCycleDay = (lastPeriodStart: string | null, cycleLength: number | null) => {
    if (!lastPeriodStart) return null;
    const daysSince = differenceInDays(new Date(), new Date(lastPeriodStart));
    const length = cycleLength || 28;
    return (daysSince % length) + 1;
  };

  const getCyclePhase = (cycleDay: number, cycleLength: number = 28) => {
    if (cycleDay <= 5) return "Menstrual";
    if (cycleDay <= 13) return "Follicular";
    if (cycleDay <= 16) return "Ovulation";
    return "Luteal";
  };

  const filtered = profiles.filter(p =>
    p.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.phone?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Detail view
  if (selectedProfile) {
    const profile = selectedProfile;
    const participant = profile.participant;
    const cycleDay = participant ? calculateCycleDay(participant.last_period_start, participant.cycle_length_days) : null;
    const phase = cycleDay ? getCyclePhase(cycleDay, participant?.cycle_length_days || 28) : null;

    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedProfile(null)}
          className="gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          All Profiles
        </Button>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Profile Info Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Profile</CardTitle>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleting}>
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete User
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete user?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{profile.full_name}</strong> and all their data including chat history and insights. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteUser(profile.id, profile.full_name)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-medium">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.full_name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    profile.full_name[0]?.toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-semibold text-lg">{profile.full_name}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{profile.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>Joined {format(new Date(profile.created_at), "MMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="w-4 h-4" />
                <span>{profile.messageCount} chat messages</span>
              </div>
            </CardContent>
          </Card>

          {/* Notification Preferences Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              {profile.notificationPrefs ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={profile.notificationPrefs.is_enabled ? "default" : "secondary"}>
                      {profile.notificationPrefs.is_enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="text-sm"><strong>Frequency:</strong> {profile.notificationPrefs.frequency}</p>
                  <p className="text-sm"><strong>Time:</strong> {profile.notificationPrefs.preferred_time}</p>
                  {profile.notificationPrefs.preferred_days && (
                    <p className="text-sm"><strong>Days:</strong> {profile.notificationPrefs.preferred_days.join(", ")}</p>
                  )}
                  <p className="text-sm"><strong>Timezone:</strong> {profile.notificationPrefs.timezone}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not configured</p>
              )}
            </CardContent>
          </Card>

          {/* Cycle Data Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Cycle Data
              </CardTitle>
            </CardHeader>
            <CardContent>
              {participant ? (
                <div className="space-y-4">
                  {/* Cycle Circle Visualization */}
                  {cycleDay && phase && (
                    <div className="flex justify-center py-2">
                      <ChatCycleCircle
                        cycleDay={cycleDay}
                        phase={phase}
                        cycleLengthDays={participant.cycle_length_days || 28}
                      />
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Cycle Length</p>
                      <p className="font-medium">{participant.cycle_length_days || 28} days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Regularity</p>
                      <p className="font-medium">{participant.cycle_regularity || "Not set"}</p>
                    </div>
                    {participant.last_period_start && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Last Period</p>
                        <p className="font-medium">{format(new Date(participant.last_period_start), "MMM d, yyyy")}</p>
                      </div>
                    )}
                  </div>
                  {participant.anchor_symptom && (
                    <div>
                      <p className="text-sm text-muted-foreground">Anchor Symptom</p>
                      <Badge variant="secondary">{participant.anchor_symptom}</Badge>
                    </div>
                  )}
                  {participant.typical_symptoms && participant.typical_symptoms.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Typical Symptoms</p>
                      <div className="flex flex-wrap gap-1">
                        {participant.typical_symptoms.map((symptom, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{symptom}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {participant.goals && participant.goals.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Goals</p>
                      <div className="flex flex-wrap gap-1">
                        {participant.goals.map((goal, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{goal}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No cycle data found (participant not linked)</p>
              )}
            </CardContent>
          </Card>

          {/* Insights Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5" />
                Insights ({profile.insights?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profile.insights && profile.insights.length > 0 ? (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {profile.insights.slice(0, 10).map((insight) => (
                    <div key={insight.id} className="border-b pb-2 last:border-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant={
                            insight.status === "sent" ? "default" : 
                            insight.status === "approved" ? "secondary" : "outline"
                          }
                          className="text-xs"
                        >
                          {insight.status || "pending"}
                        </Badge>
                        {insight.insight_type && (
                          <Badge variant="outline" className="text-xs">{insight.insight_type}</Badge>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2">{insight.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(insight.created_at), "MMM d, yyyy")}
                        {insight.sent_at && ` • Sent ${format(new Date(insight.sent_at), "MMM d")}`}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No insights yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chat History Card - Full Width */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Chat History ({chatMessages.length})
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => fetchChatMessages(profile.id)}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loadingMessages ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No messages yet</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {chatMessages.map((msg) => {
                  const isAssistant = msg.role === "assistant" || msg.role === "system";
                  const metadata = msg.metadata as MessageMetadata | null;
                  const hasCycleVisual = metadata?.has_cycle_visual;
                  
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "max-w-[85%]",
                        isAssistant ? "ml-auto" : "mr-auto"
                      )}
                    >
                      {/* Role indicator */}
                      <div className={cn(
                        "text-xs mb-1 flex items-center gap-2",
                        isAssistant ? "justify-end text-muted-foreground" : "text-muted-foreground"
                      )}>
                        <span>{msg.role === "user" ? "User" : msg.role === "assistant" ? "Logan" : "System"}</span>
                        {msg.message_type && msg.message_type !== "text" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {msg.message_type}
                          </Badge>
                        )}
                      </div>

                      {/* Message bubble */}
                      <div
                        className={cn(
                          "rounded-lg p-3",
                          isAssistant
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {/* Cycle visual if present */}
                        {hasCycleVisual && metadata?.cycle_day && metadata?.cycle_phase && (
                          <div className="mb-3">
                            <ChatCycleCircle
                              cycleDay={metadata.cycle_day}
                              phase={metadata.cycle_phase}
                              cycleLengthDays={metadata.cycle_length_days || 28}
                            />
                          </div>
                        )}

                        {/* Message content */}
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                        {/* Emoji reaction */}
                        {msg.emoji_reaction && (
                          <div className="mt-2">
                            <span className="text-xl">{msg.emoji_reaction}</span>
                          </div>
                        )}

                        {/* Timestamp */}
                        <p className={cn(
                          "text-[10px] mt-2",
                          isAssistant ? "text-primary-foreground/60" : "text-muted-foreground"
                        )}>
                          {format(new Date(msg.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <span className="font-medium">{profiles.length} User Profiles</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[280px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Profile Cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No profiles found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((profile) => {
            const cycleDay = profile.participant 
              ? calculateCycleDay(profile.participant.last_period_start, profile.participant.cycle_length_days) 
              : null;
            const phase = cycleDay ? getCyclePhase(cycleDay, profile.participant?.cycle_length_days || 28) : null;
            
            return (
              <Card
                key={profile.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => setSelectedProfile(profile)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-4">
                    {cycleDay && phase ? (
                      <div className="shrink-0">
                        <ChatCycleCircle
                          cycleDay={cycleDay}
                          phase={phase}
                          cycleLengthDays={profile.participant?.cycle_length_days || 28}
                          size="sm"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.full_name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          profile.full_name[0]?.toUpperCase()
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{profile.full_name}</span>
                        {cycleDay && phase && (
                          <>
                            <Badge variant="outline" className="text-xs">Day {cycleDay}</Badge>
                            <Badge variant="secondary" className="text-xs">{phase}</Badge>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span className="truncate max-w-[150px]">{profile.email}</span>
                        </span>
                        <span>{profile.messageCount} messages</span>
                        {profile.insights && profile.insights.length > 0 && (
                          <span>{profile.insights.length} insights</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
