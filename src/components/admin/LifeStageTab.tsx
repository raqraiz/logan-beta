import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { onboardedProfiles } from "@/lib/onboardedUsers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users, RefreshCw, Search, Mail, Clock, ChevronRight, ChevronDown,
  ChevronsUpDown, ChevronsDownUp, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ChatCycleCircle, calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface Participant {
  id: string;
  email: string | null;
  user_id?: string | null;
  full_name: string;
  last_period_start: string | null;
  cycle_length_days: number | null;
  timezone: string | null;
  life_stage: string | null;
  postpartum_start_date: string | null;
  postpartum_active?: boolean | null;
  period_pending_since?: string | null;
  period_still_active?: boolean | null;
  current_period_end_date?: string | null;
}

interface ProfileWithData extends Profile {
  participant?: Participant;
  messageCount: number;
  lastUserMessage: string | null;
}

// Known life-stage values in display order. Unknown future values are appended
// dynamically after these; "Not set" is always rendered last.
const KNOWN_STAGES: { value: string; label: string }[] = [
  { value: "cycling", label: "Cycling" },
  { value: "irregular", label: "Irregular" },
  { value: "pregnant", label: "Pregnant" },
  { value: "postpartum", label: "Postpartum" },
  { value: "pregnancy_loss", label: "Pregnancy loss" },
  { value: "perimenopause", label: "Perimenopause" },
  { value: "menopause", label: "Menopause" },
];
const NOT_SET = "__not_set__";

const stageKey = (p: ProfileWithData): string => {
  const raw = p.participant?.life_stage;
  const v = typeof raw === "string" ? raw.trim() : "";
  return v === "" ? NOT_SET : v;
};

const stageLabel = (key: string): string => {
  if (key === NOT_SET) return "Not set";
  const known = KNOWN_STAGES.find((s) => s.value === key);
  if (known) return known.label;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export function LifeStageTab() {
  const [profiles, setProfiles] = useState<ProfileWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data: profilesData, error: profilesError } = await onboardedProfiles()
        .select("*")
        .order("created_at", { ascending: false });
      if (profilesError) throw profilesError;

      const { data: participantsData, error: participantsError } = await supabase
        .from("participants")
        .select("*");
      if (participantsError) throw participantsError;

      const participantsByUserId = new Map<string, Participant>();
      const participantsByEmail = new Map<string, Participant>();
      participantsData?.forEach((p) => {
        if (p.user_id) participantsByUserId.set(p.user_id, p as Participant);
        if (p.email) participantsByEmail.set(p.email.toLowerCase(), p as Participant);
      });

      // One chat_messages query for per-user counts + last user message
      // (same fields Directory shows on each row).
      const { data: allMessages, error: messagesError } = await supabase
        .from("chat_messages")
        .select("user_id, role, created_at")
        .order("created_at", { ascending: true });
      if (messagesError) throw messagesError;

      const statsByUser = new Map<string, { count: number; lastUserMessage: string | null }>();
      (allMessages || []).forEach((m) => {
        const entry = statsByUser.get(m.user_id) || { count: 0, lastUserMessage: null };
        entry.count++;
        if (m.role === "user") entry.lastUserMessage = m.created_at;
        statsByUser.set(m.user_id, entry);
      });

      const enriched: ProfileWithData[] = ((profilesData || []) as any[]).map((profile) => {
        const participant =
          participantsByUserId.get(profile.id) ||
          participantsByEmail.get(profile.email?.toLowerCase?.() || "");
        const stats = statsByUser.get(profile.id);
        return {
          ...profile,
          participant,
          messageCount: stats?.count || 0,
          lastUserMessage: stats?.lastUserMessage || null,
        };
      });

      setProfiles(enriched);
    } catch (error) {
      console.error("Error loading life stage data:", error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return profiles;
    const q = searchQuery.toLowerCase();
    return profiles.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q)
    );
  }, [profiles, searchQuery]);

  const groups = useMemo(() => {
    const byStage = new Map<string, ProfileWithData[]>();
    profiles.forEach((p) => {
      const key = stageKey(p);
      if (!byStage.has(key)) byStage.set(key, []);
      byStage.get(key)!.push(p);
    });

    // Order: known stages first (fixed order), unknown values next, "Not set" last.
    const ordered: string[] = [];
    KNOWN_STAGES.forEach((s) => {
      if (byStage.has(s.value)) ordered.push(s.value);
    });
    [...byStage.keys()]
      .filter((k) => k !== NOT_SET && !KNOWN_STAGES.some((s) => s.value === k))
      .sort()
      .forEach((k) => ordered.push(k));
    if (byStage.has(NOT_SET)) ordered.push(NOT_SET);

    return ordered.map((key) => {
      const members = byStage.get(key)!;
      const visible = searchQuery.trim()
        ? members.filter((m) => filtered.includes(m))
        : members;
      return { key, label: stageLabel(key), members, visible };
    });
  }, [profiles, filtered, searchQuery]);

  // Auto-expand only groups containing a search match; everything else collapses.
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpanded(new Set(groups.filter((g) => g.visible.length > 0).map((g) => g.key)));
    } else {
      setExpanded(new Set());
    }
  }, [searchQuery, groups]);

  const searching = searchQuery.trim().length > 0;
  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const expandAll = () => setExpanded(new Set(groups.filter((g) => g.visible.length > 0).map((g) => g.key)));
  const collapseAll = () => setExpanded(new Set());

  const getCycleData = (participant: Participant) =>
    calculateCycleInfo(
      participant.last_period_start,
      participant.cycle_length_days,
      participant.timezone || "Asia/Jerusalem",
      undefined,
      participant.current_period_end_date ?? null,
      !!participant.period_pending_since,
      !!participant.period_still_active,
    );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4 px-4">
                <div className="h-4 w-20 bg-muted animate-pulse rounded mb-2" />
                <div className="h-7 w-12 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-muted-foreground">Failed to load life stage data.</p>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards — one per stage present (incl. zero-count known stages), Not set last */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {groups.map((g) => (
          <Card key={g.key}>
            <CardContent className="py-4 px-4">
              <p className="text-xs text-muted-foreground truncate">{g.label}</p>
              <p className="text-2xl font-semibold">{g.members.length}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Header: search + expand/collapse all */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <span className="font-medium">{profiles.length} users by life stage</span>
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
          <Button variant="outline" size="sm" onClick={expandAll} title="Expand all">
            <ChevronsUpDown className="w-4 h-4 mr-1" />
            Expand
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} title="Collapse all">
            <ChevronsDownUp className="w-4 h-4 mr-1" />
            Collapse
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Grouped list */}
      {profiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No profiles found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const hasMembers = group.visible.length > 0;
            const isOpen = expanded.has(group.key);
            return (
              <Card key={group.key} className={cn(!hasMembers && "opacity-50")}>
                <button
                  type="button"
                  disabled={!hasMembers}
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 text-left",
                    hasMembers && "cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg"
                  )}
                >
                  <span className="font-medium">
                    {group.label}
                    <span className="ml-2 text-sm text-muted-foreground">
                      ({searching ? group.visible.length : group.members.length})
                    </span>
                  </span>
                  {hasMembers &&
                    (isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ))}
                </button>
                {isOpen && hasMembers && (
                  <div className="px-4 pb-4 space-y-2">
                    {group.visible.map((profile) => {
                      const ls = profile.participant?.life_stage;
                      const isNonCycling =
                        ls === "postpartum" || ls === "menopause" || ls === "pregnant" || ls === "pregnancy_loss";
                      const cycleData = profile.participant ? getCycleData(profile.participant) : null;
                      const cycleDay = cycleData?.cycleDay ?? null;
                      const phase = cycleData?.phase ?? null;
                      const lifeStage = (profile.participant?.life_stage || "cycling") as any;
                      const nonCyclingPhase =
                        lifeStage === "postpartum" ? "Postpartum" :
                        lifeStage === "menopause" ? "Menopause" :
                        lifeStage === "pregnant" ? "Pregnant" :
                        lifeStage === "pregnancy_loss" ? "Recovery" : "Menopause";

                      return (
                        <Card key={profile.id}>
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center gap-4">
                              {isNonCycling ? (
                                <div className="shrink-0">
                                  <ChatCycleCircle
                                    cycleDay={0}
                                    phase={nonCyclingPhase}
                                    cycleLengthDays={0}
                                    size="sm"
                                    lifeStage={lifeStage}
                                    postpartumStartDate={profile.participant?.postpartum_start_date || undefined}
                                    lossDate={(profile.participant as any)?.loss_date || undefined}
                                    dueDate={(profile.participant as any)?.due_date || undefined}
                                    pregnancyLmp={(profile.participant as any)?.pregnancy_lmp || undefined}
                                  />
                                </div>
                              ) : cycleDay && phase ? (
                                <div className="shrink-0">
                                  <ChatCycleCircle
                                    cycleDay={cycleDay}
                                    phase={phase}
                                    cycleLengthDays={profile.participant?.cycle_length_days || 28}
                                    size="sm"
                                    postpartumActive={!!(profile.participant as any)?.postpartum_active}
                                    postpartumStartDate={profile.participant?.postpartum_start_date || undefined}
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
                                  {isNonCycling ? (
                                    <Badge variant="secondary" className="text-xs capitalize">{lifeStage}</Badge>
                                  ) : cycleDay && phase ? (
                                    <>
                                      <Badge variant="outline" className="text-xs">Day {cycleDay}</Badge>
                                      <Badge variant="secondary" className="text-xs">{phase}</Badge>
                                    </>
                                  ) : null}
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
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
