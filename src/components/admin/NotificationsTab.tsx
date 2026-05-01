import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { Send, Save, Users, Loader2, Trash2, RefreshCw } from "lucide-react";
import { format } from "date-fns";

type Activity = "" | "today" | "week" | "month" | "dormant";
type Credits = "" | "out" | "free_only" | "paid";

interface Filters {
  life_stage: string[];
  activity: Activity;
  most_active: number | null;
  cycle_phase: string[];
  timezone: string[];
  credits: Credits;
  participant_ids: string[];
}

interface Broadcast {
  id: string;
  title: string | null;
  content: string;
  segment_filters: any;
  status: string;
  recipient_count: number | null;
  sent_at: string | null;
  created_at: string;
}

interface ParticipantLite {
  id: string;
  full_name: string;
  email: string | null;
}

const LIFE_STAGES = ["cycling", "postpartum", "menopause"];
const PHASES = ["menstrual", "follicular", "ovulation", "luteal"];

const emptyFilters: Filters = {
  life_stage: [],
  activity: "",
  most_active: null,
  cycle_phase: [],
  timezone: [],
  credits: "",
  participant_ids: [],
};

export function NotificationsTab() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [participantsList, setParticipantsList] = useState<ParticipantLite[]>([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [drafts, setDrafts] = useState<Broadcast[]>([]);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // Load distinct timezones from participants
  useEffect(() => {
    supabase
      .from("participants")
      .select("timezone")
      .not("timezone", "is", null)
      .then(({ data }) => {
        const unique = Array.from(
          new Set((data ?? []).map((p) => p.timezone).filter(Boolean) as string[]),
        ).sort();
        setTimezones(unique);
      });
    loadBroadcasts();
  }, []);

  const loadBroadcasts = async () => {
    const { data } = await supabase
      .from("admin_broadcasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    const all = (data ?? []) as Broadcast[];
    setDrafts(all.filter((b) => b.status === "draft"));
    setHistory(all.filter((b) => b.status === "sent"));
  };

  const buildPayload = (action: "preview" | "send") => ({
    action,
    title: title.trim() || null,
    content: content.trim(),
    filters: {
      life_stage: filters.life_stage.length > 0 ? filters.life_stage : undefined,
      activity: filters.activity || undefined,
      most_active: filters.most_active || undefined,
      cycle_phase: filters.cycle_phase.length > 0 ? filters.cycle_phase : undefined,
      timezone: filters.timezone.length > 0 ? filters.timezone : undefined,
      credits: filters.credits || undefined,
    },
    broadcast_id: editingDraftId ?? undefined,
  });

  const handlePreview = async () => {
    setIsPreviewing(true);
    setPreviewCount(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: buildPayload("preview"),
      });
      if (error) throw error;
      setPreviewCount(data?.count ?? 0);
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!content.trim()) {
      toast({ title: "Message required", description: "Please write a message.", variant: "destructive" });
      return;
    }
    if (!confirm(`Send this message to ${previewCount ?? "?"} users? This cannot be undone.`)) return;
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-broadcast", {
        body: buildPayload("send"),
      });
      if (error) throw error;
      toast({ title: "Broadcast sent", description: `Delivered to ${data?.count ?? 0} users.` });
      resetForm();
      loadBroadcasts();
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!content.trim()) {
      toast({ title: "Message required", variant: "destructive" });
      return;
    }
    setIsSavingDraft(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        title: title.trim() || null,
        content: content.trim(),
        segment_filters: buildPayload("preview").filters as any,
        status: "draft",
        created_by: userData.user!.id,
      };
      if (editingDraftId) {
        await supabase.from("admin_broadcasts").update(payload).eq("id", editingDraftId);
      } else {
        await supabase.from("admin_broadcasts").insert(payload);
      }
      toast({ title: "Draft saved" });
      resetForm();
      loadBroadcasts();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const loadDraft = (d: Broadcast) => {
    setEditingDraftId(d.id);
    setTitle(d.title ?? "");
    setContent(d.content);
    const f = d.segment_filters || {};
    setFilters({
      life_stage: f.life_stage ?? [],
      activity: f.activity ?? "",
      most_active: f.most_active ?? null,
      cycle_phase: f.cycle_phase ?? [],
      timezone: f.timezone ?? [],
      credits: f.credits ?? "",
    });
    setPreviewCount(null);
  };

  const deleteDraft = async (id: string) => {
    if (!confirm("Delete this draft?")) return;
    await supabase.from("admin_broadcasts").delete().eq("id", id);
    if (editingDraftId === id) resetForm();
    loadBroadcasts();
  };

  const resetForm = () => {
    setEditingDraftId(null);
    setTitle("");
    setContent("");
    setFilters(emptyFilters);
    setPreviewCount(null);
  };

  const toggleArr = (key: "life_stage" | "cycle_phase" | "timezone", val: string) => {
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val],
    }));
    setPreviewCount(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Composer */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">
              {editingDraftId ? "Editing draft" : "New notification"}
            </h3>
            {editingDraftId && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <RefreshCw className="w-3 h-3 mr-1" /> New
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Title (internal — not shown to users)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Menu Builder launch" />
          </div>

          <div className="space-y-2">
            <Label>Message (sent as Logan in the user's chat)</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Hey! I just added a new Menu Builder under your Plan tab..."
              rows={5}
            />
          </div>

          {/* Filters */}
          <div className="space-y-4 pt-2 border-t border-border">
            <h4 className="text-sm font-semibold text-foreground">Segment filters</h4>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Life stage</Label>
              <div className="flex flex-wrap gap-2">
                {LIFE_STAGES.map((s) => (
                  <Badge
                    key={s}
                    variant={filters.life_stage.includes(s) ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleArr("life_stage", s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Current cycle phase</Label>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((p) => (
                  <Badge
                    key={p}
                    variant={filters.cycle_phase.includes(p) ? "default" : "outline"}
                    className="cursor-pointer capitalize"
                    onClick={() => toggleArr("cycle_phase", p)}
                  >
                    {p}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Activity</Label>
                <Select
                  value={filters.activity}
                  onValueChange={(v) => {
                    setFilters((f) => ({ ...f, activity: v as Activity }));
                    setPreviewCount(null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Any activity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Active today</SelectItem>
                    <SelectItem value="week">Active this week</SelectItem>
                    <SelectItem value="month">Active last 30 days</SelectItem>
                    <SelectItem value="dormant">Dormant 30+ days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Credits</Label>
                <Select
                  value={filters.credits}
                  onValueChange={(v) => {
                    setFilters((f) => ({ ...f, credits: v as Credits }));
                    setPreviewCount(null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Any credits" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="out">Out of credits</SelectItem>
                    <SelectItem value="free_only">Free tier only</SelectItem>
                    <SelectItem value="paid">Paid users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Top N most active users (last 30 days)
              </Label>
              <Input
                type="number"
                min={0}
                value={filters.most_active ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? parseInt(e.target.value) : null;
                  setFilters((f) => ({ ...f, most_active: v }));
                  setPreviewCount(null);
                }}
                placeholder="e.g. 10"
              />
            </div>

            {timezones.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Timezone (proxy for country)</Label>
                <ScrollArea className="h-32 rounded-md border border-border p-2">
                  <div className="space-y-1">
                    {timezones.map((tz) => (
                      <label key={tz} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={filters.timezone.includes(tz)}
                          onCheckedChange={() => toggleArr("timezone", tz)}
                        />
                        <span className="text-foreground">{tz}</span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
            <Button onClick={handlePreview} variant="outline" disabled={isPreviewing} className="flex-1">
              {isPreviewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
              Preview audience
            </Button>
            <Button onClick={handleSaveDraft} variant="outline" disabled={isSavingDraft} className="flex-1">
              {isSavingDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save draft
            </Button>
            <Button onClick={handleSend} disabled={isSending || previewCount === null} className="flex-1">
              {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send {previewCount !== null ? `(${previewCount})` : ""}
            </Button>
          </div>

          {previewCount !== null && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-sm text-foreground">
              <strong>{previewCount}</strong> user{previewCount === 1 ? "" : "s"} match this segment.
              {previewCount === 0 && " Adjust filters and re-preview."}
            </div>
          )}
        </Card>
      </div>

      {/* Sidebar: drafts + history */}
      <div className="space-y-6">
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">Drafts ({drafts.length})</h4>
          <div className="space-y-2">
            {drafts.length === 0 && (
              <p className="text-xs text-muted-foreground">No drafts yet.</p>
            )}
            {drafts.map((d) => (
              <div key={d.id} className="rounded-lg border border-border p-2 space-y-1">
                <p className="text-xs font-medium text-foreground line-clamp-1">
                  {d.title || d.content.slice(0, 40)}
                </p>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{d.content}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => loadDraft(d)} className="text-xs h-7">
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteDraft(d.id)} className="text-xs h-7 text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">Sent history</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing sent yet.</p>
            )}
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-border p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground line-clamp-1">
                    {h.title || h.content.slice(0, 30)}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">
                    {h.recipient_count ?? 0}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {h.sent_at ? format(new Date(h.sent_at), "MMM d, h:mm a") : ""}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
