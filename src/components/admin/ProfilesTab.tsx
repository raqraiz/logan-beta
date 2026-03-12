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
  ChevronLeft, Trash2, Loader2, Activity, Clock, MessageSquare,
  Pencil, Download
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ChatCycleCircle, calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
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
  participant?: Participant;
  messageCount?: number;
  lastUserMessage?: string | null;
  avgMessagesPerSession?: number | null;
  avgSessionsPerWeek?: number | null;
}

function calculateSessionStats(messages: { created_at: string }[]): { avgPerSession: number | null; avgPerWeek: number | null } {
  if (messages.length === 0) return { avgPerSession: null, avgPerWeek: null };
  const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const SESSION_GAP_MS = 30 * 60 * 1000;
  let sessionCount = 1;
  for (let i = 1; i < sorted.length; i++) {
    const gap = new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime();
    if (gap > SESSION_GAP_MS) sessionCount++;
  }
  const avgPerSession = Math.round((sorted.length / sessionCount) * 10) / 10;
  const firstMsg = new Date(sorted[0].created_at).getTime();
  const lastMsg = new Date(sorted[sorted.length - 1].created_at).getTime();
  const weeks = Math.max((lastMsg - firstMsg) / (7 * 24 * 60 * 60 * 1000), 1);
  const avgPerWeek = Math.round((sessionCount / weeks) * 10) / 10;
  return { avgPerSession, avgPerWeek };
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

      // Fetch participants (by email match)
      const { data: participantsData, error: participantsError } = await supabase
        .from("participants")
        .select("*");

      if (participantsError) throw participantsError;

      // Fetch message data (user_id and created_at for session calculation)
      const { data: messagesData, error: messagesError } = await supabase
        .from("chat_messages")
        .select("user_id, created_at");

      if (messagesError) throw messagesError;

      // Build maps
      const participantsByEmail = new Map<string, Participant>();
      participantsData?.forEach(p => {
        if (p.email) participantsByEmail.set(p.email.toLowerCase(), p);
      });

      const messageCountByUser = new Map<string, number>();
      const messagesByUser = new Map<string, { created_at: string }[]>();
      messagesData?.forEach(msg => {
        messageCountByUser.set(msg.user_id, (messageCountByUser.get(msg.user_id) || 0) + 1);
        const list = messagesByUser.get(msg.user_id) || [];
        list.push({ created_at: msg.created_at });
        messagesByUser.set(msg.user_id, list);
      });

      // Get last user message timestamps for sorting by engagement
      const { data: allMessages } = await supabase
        .from("chat_messages")
        .select("user_id, created_at, role")
        .eq("role", "user")
        .order("created_at", { ascending: false });

      const lastUserMessageByUser = new Map<string, string>();
      allMessages?.forEach(msg => {
        if (!lastUserMessageByUser.has(msg.user_id)) {
          lastUserMessageByUser.set(msg.user_id, msg.created_at);
        }
      });

      // Combine data
      const enrichedProfiles: ProfileWithData[] = (profilesData || []).map(profile => {
        const participant = participantsByEmail.get(profile.email.toLowerCase());
        const userMessages = messagesByUser.get(profile.id) || [];
        const stats = calculateSessionStats(userMessages);
        return {
          ...profile,
          participant,
          messageCount: messageCountByUser.get(profile.id) || 0,
          lastUserMessage: lastUserMessageByUser.get(profile.id) || null,
          avgMessagesPerSession: stats.avgPerSession,
          avgSessionsPerWeek: stats.avgPerWeek,
        };
      });

      // Sort by last user engagement (most recent first)
      enrichedProfiles.sort((a, b) => {
        const aTime = a.lastUserMessage ? new Date(a.lastUserMessage).getTime() : 0;
        const bTime = b.lastUserMessage ? new Date(b.lastUserMessage).getTime() : 0;
        return bTime - aTime;
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

  const getCycleData = (participant: { last_period_start: string | null; cycle_length_days: number | null; timezone?: string | null }) => {
    return calculateCycleInfo(participant.last_period_start, participant.cycle_length_days, participant.timezone || "Asia/Jerusalem");
  };

  const handleDownloadUserData = (profile: ProfileWithData, messages: ChatMessage[]) => {
    const p = profile.participant;
    const lines: string[] = [];

    lines.push(`═══════════════════════════════════════`);
    lines.push(`  USER REPORT — ${profile.full_name}`);
    lines.push(`  Exported ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`);
    lines.push(`═══════════════════════════════════════`);
    lines.push(``);

    // Profile
    lines.push(`── PROFILE ──`);
    lines.push(`Name:       ${profile.full_name}`);
    lines.push(`Email:      ${profile.email}`);
    if (profile.phone) lines.push(`Phone:      ${profile.phone}`);
    lines.push(`Joined:     ${format(new Date(profile.created_at), "MMMM d, yyyy")}`);
    lines.push(``);

    // Cycle data
    if (p) {
      lines.push(`── CYCLE DATA ──`);
      lines.push(`Cycle length:    ${p.cycle_length_days || 28} days`);
      if (p.cycle_regularity) lines.push(`Regularity:      ${p.cycle_regularity}`);
      if (p.last_period_start) lines.push(`Last period:     ${format(new Date(p.last_period_start), "MMMM d, yyyy")}`);
      if (p.anchor_symptom) lines.push(`Anchor symptom:  ${p.anchor_symptom}`);
      if (p.typical_symptoms?.length) lines.push(`Symptoms:        ${p.typical_symptoms.join(", ")}`);
      if (p.goals?.length) lines.push(`Goals:           ${p.goals.join(", ")}`);
      if (p.timezone) lines.push(`Timezone:        ${p.timezone}`);
      lines.push(``);
    }

    // Chat history
    lines.push(`── CHAT HISTORY (${messages.length} messages) ──`);
    lines.push(``);
    messages.forEach((m) => {
      const sender = m.role === "user" ? profile.full_name : m.role === "assistant" ? "Logan" : "System";
      const time = format(new Date(m.created_at), "MMM d, yyyy h:mm a");
      lines.push(`[${time}] ${sender}:`);
      lines.push(`${m.content}`);
      if (m.emoji_reaction) lines.push(`  Reaction: ${m.emoji_reaction}`);
      lines.push(``);
    });

    lines.push(`═══════════════════════════════════════`);
    lines.push(`  End of report`);
    lines.push(`═══════════════════════════════════════`);

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.full_name.replace(/\s+/g, "_")}_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
    const cycleData = participant ? getCycleData(participant) : null;
    const cycleDay = cycleData?.cycleDay ?? null;
    const phase = cycleData?.phase ?? null;

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
                <Button variant="outline" size="sm" onClick={() => handleDownloadUserData(profile, chatMessages)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
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
                        This will permanently delete <strong>{profile.full_name}</strong> and all their data including chat history. This action cannot be undone.
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
              {profile.avgMessagesPerSession != null && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="w-4 h-4" />
                  <span>{profile.avgMessagesPerSession} avg messages per session</span>
                </div>
              )}
              {profile.avgSessionsPerWeek != null && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{profile.avgSessionsPerWeek} avg sessions per week</span>
                </div>
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
            const cycleData = profile.participant ? getCycleData(profile.participant) : null;
            const cycleDay = cycleData?.cycleDay ?? null;
            const phase = cycleData?.phase ?? null;
            
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
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span className="truncate max-w-[150px]">{profile.email}</span>
                        </span>
                        <span>{profile.messageCount} messages</span>
                        {profile.lastUserMessage && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(profile.lastUserMessage), "MMM d, yyyy")}
                          </span>
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
