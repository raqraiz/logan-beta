import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { 
  Users, RefreshCw, Search, Mail, Phone, Calendar, ChevronRight, 
  ChevronLeft, Trash2, Loader2, Activity, Target, Clock, MessageSquare,
  Bell, BellOff, CheckCircle2, XCircle, Pencil
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
  last_notification_at: string | null;
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
  whatsapp_number: string;
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
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "", email: "", phone: "",
    cycle_length_days: "28", cycle_regularity: "", last_period_start: "",
    anchor_symptom: "", typical_symptoms: "", goals: "", timezone: "Asia/Jerusalem",
  });
  const [saving, setSaving] = useState(false);

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

  const openEditDialog = () => {
    if (!selectedProfile) return;
    const p = selectedProfile.participant;
    setEditForm({
      full_name: selectedProfile.full_name,
      email: selectedProfile.email,
      phone: selectedProfile.phone || "",
      cycle_length_days: String(p?.cycle_length_days ?? 28),
      cycle_regularity: p?.cycle_regularity || "",
      last_period_start: p?.last_period_start || "",
      anchor_symptom: p?.anchor_symptom || "",
      typical_symptoms: p?.typical_symptoms?.join(", ") || "",
      goals: p?.goals?.join(", ") || "",
      timezone: p?.timezone || "Asia/Jerusalem",
    });
    setEditOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!selectedProfile) return;
    setSaving(true);
    try {
      // Update profile table
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editForm.full_name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || null,
        })
        .eq("id", selectedProfile.id);

      if (error) throw error;

      // Update participant table if it exists
      if (selectedProfile.participant) {
        const symptomsArr = editForm.typical_symptoms.trim()
          ? editForm.typical_symptoms.split(",").map(s => s.trim()).filter(Boolean)
          : null;
        const goalsArr = editForm.goals.trim()
          ? editForm.goals.split(",").map(s => s.trim()).filter(Boolean)
          : null;

        const { error: pError } = await supabase
          .from("participants")
          .update({
            full_name: editForm.full_name.trim(),
            email: editForm.email.trim(),
            whatsapp_number: editForm.phone.trim() || selectedProfile.participant.whatsapp_number || "",
            cycle_length_days: parseInt(editForm.cycle_length_days) || 28,
            cycle_regularity: editForm.cycle_regularity.trim() || null,
            last_period_start: editForm.last_period_start || null,
            anchor_symptom: editForm.anchor_symptom.trim() || null,
            typical_symptoms: symptomsArr,
            goals: goalsArr,
            timezone: editForm.timezone.trim() || "Asia/Jerusalem",
          })
          .eq("id", selectedProfile.participant.id);

        if (pError) throw pError;
      }

      toast({ title: "Profile updated successfully" });
      setEditOpen(false);
      fetchData();
      setSelectedProfile(null);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({ title: "Error updating profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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

  const TIME_WINDOWS: Record<string, { start: number; end: number }> = {
    morning: { start: 7, end: 10 },
    afternoon: { start: 12, end: 15 },
    evening: { start: 19, end: 22 },
  };

  const getNotificationStatus = (prefs?: NotificationPreference): {
    status: "sent" | "pending" | "not_scheduled" | "disabled";
    label: string;
  } => {
    if (!prefs) return { status: "not_scheduled", label: "Not configured" };
    if (!prefs.is_enabled) return { status: "disabled", label: "Disabled" };

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const todayStr = israelTime.toLocaleDateString("en-US", { timeZone: "Asia/Jerusalem" });
    const currentDay = israelTime.toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Jerusalem" }).toLowerCase();
    const currentHour = israelTime.getHours();

    // Check if today is a scheduled day
    const isDaily = prefs.frequency === "daily";
    const isScheduledToday = isDaily || (prefs.preferred_days?.includes(currentDay) ?? false);

    if (!isScheduledToday) return { status: "not_scheduled", label: "Not today" };

    // Check if already sent today
    if (prefs.last_notification_at) {
      const lastNotifDay = new Date(prefs.last_notification_at).toLocaleDateString("en-US", { timeZone: "Asia/Jerusalem" });
      if (lastNotifDay === todayStr) {
        const sentTime = new Date(prefs.last_notification_at);
        const sentTimeIsrael = new Date(sentTime.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
        return { 
          status: "sent", 
          label: `Sent ${format(sentTimeIsrael, "h:mm a")}` 
        };
      }
    }

    // Scheduled but not yet sent
    const window = TIME_WINDOWS[prefs.preferred_time] || TIME_WINDOWS.evening;
    if (currentHour < window.start) {
      return { status: "pending", label: `Pending (${prefs.preferred_time})` };
    } else if (currentHour >= window.end) {
      return { status: "pending", label: "Missed window" };
    } else {
      return { status: "pending", label: "Due now" };
    }
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
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={openEditDialog}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={deleting}>
                      {deleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
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
              </div>
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
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profile.notificationPrefs ? (
                <div className="space-y-3">
                  {/* Today's status */}
                  {(() => {
                    const notifStatus = getNotificationStatus(profile.notificationPrefs);
                    return (
                      <div className={cn(
                        "flex items-center gap-2 rounded-lg p-2.5 text-sm font-medium",
                        notifStatus.status === "sent" && "bg-green-500/10 text-green-700",
                        notifStatus.status === "pending" && "bg-yellow-500/10 text-yellow-700",
                        notifStatus.status === "disabled" && "bg-muted text-muted-foreground",
                        notifStatus.status === "not_scheduled" && "bg-muted text-muted-foreground",
                      )}>
                        {notifStatus.status === "sent" ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : notifStatus.status === "pending" ? (
                          <Bell className="w-4 h-4" />
                        ) : (
                          <BellOff className="w-4 h-4" />
                        )}
                        Today: {notifStatus.label}
                      </div>
                    );
                  })()}

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
                  {profile.notificationPrefs.last_notification_at && (
                    <p className="text-sm text-muted-foreground">
                      Last sent: {format(new Date(profile.notificationPrefs.last_notification_at), "MMM d, h:mm a")}
                    </p>
                  )}
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

        {/* Edit Profile Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit User Data</DialogTitle>
              <DialogDescription>Update profile and cycle information</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* Profile section */}
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Profile</h4>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-name">Full Name</Label>
                    <Input id="edit-name" value={editForm.full_name} onChange={(e) => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-phone">Phone Number</Label>
                    <Input id="edit-phone" type="tel" placeholder="+972..." value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">Include country code, e.g. +972501234567</p>
                  </div>
                </div>
              </div>

              {/* Cycle section */}
              {selectedProfile?.participant && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">Cycle Data</h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-cycle-length">Cycle Length (days)</Label>
                        <Input id="edit-cycle-length" type="number" min="18" max="45" value={editForm.cycle_length_days} onChange={(e) => setEditForm(f => ({ ...f, cycle_length_days: e.target.value }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-regularity">Regularity</Label>
                        <Input id="edit-regularity" placeholder="e.g. regular, irregular" value={editForm.cycle_regularity} onChange={(e) => setEditForm(f => ({ ...f, cycle_regularity: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-period">Last Period Start</Label>
                      <Input id="edit-period" type="date" value={editForm.last_period_start} onChange={(e) => setEditForm(f => ({ ...f, last_period_start: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-anchor">Anchor Symptom</Label>
                      <Input id="edit-anchor" placeholder="e.g. cramps, bloating" value={editForm.anchor_symptom} onChange={(e) => setEditForm(f => ({ ...f, anchor_symptom: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-symptoms">Typical Symptoms</Label>
                      <Input id="edit-symptoms" placeholder="Comma-separated, e.g. cramps, fatigue" value={editForm.typical_symptoms} onChange={(e) => setEditForm(f => ({ ...f, typical_symptoms: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-goals">Goals</Label>
                      <Input id="edit-goals" placeholder="Comma-separated, e.g. track cycles, reduce PMS" value={editForm.goals} onChange={(e) => setEditForm(f => ({ ...f, goals: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-tz">Timezone</Label>
                      <Input id="edit-tz" value={editForm.timezone} onChange={(e) => setEditForm(f => ({ ...f, timezone: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveProfile} disabled={saving || !editForm.full_name.trim() || !editForm.email.trim()}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                        {(() => {
                          const notifStatus = getNotificationStatus(profile.notificationPrefs);
                          return (
                            <span className="flex items-center gap-1">
                              {notifStatus.status === "sent" ? (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              ) : notifStatus.status === "pending" ? (
                                <Bell className="w-3 h-3 text-yellow-500" />
                              ) : notifStatus.status === "disabled" ? (
                                <BellOff className="w-3 h-3 text-muted-foreground" />
                              ) : (
                                <XCircle className="w-3 h-3 text-muted-foreground" />
                              )}
                              <span className={cn(
                                "text-xs",
                                notifStatus.status === "sent" && "text-green-600",
                                notifStatus.status === "pending" && "text-yellow-600"
                              )}>
                                {notifStatus.label}
                              </span>
                            </span>
                          );
                        })()}
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
