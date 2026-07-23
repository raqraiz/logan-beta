import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Activity, Plus, Sparkles, Pencil, Trash2, X, CalendarIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

const SYMPTOM_CATEGORIES: { label: string; symptoms: string[] }[] = [
  {
    label: "Physical",
    symptoms: [
      "Acne", "Back pain", "Bloating", "Breast tenderness", "Cramps",
      "Dehydrated skin", "Dry skin", "Fatigue", "Headache", "Hot flashes",
      "Insomnia", "Joint pain", "Nausea", "Night sweats", "Spotting", "Thirst",
    ],
  },
  {
    label: "Emotional",
    symptoms: [
      "Anxiety", "Brain fog", "Irritability", "Low motivation", "Mood swings",
      "Overwhelm", "Restlessness", "Sadness",
    ],
  },
  {
    label: "Energy & focus",
    symptoms: ["High energy", "Low energy", "Poor focus", "Sharp focus"],
  },
  {
    label: "Other",
    symptoms: ["Cravings"],
  },
];

// Shared symptom categories (community-contributed tags)
const SHARED_CATEGORIES = [
  "Skin & Body",
  "Digestive",
  "Ear/Nose/Throat",
  "Sleep & Energy",
  "Mood & Cognitive",
  "Reproductive & Discharge",
  "Pain",
  "Other",
] as const;
type SharedCategory = typeof SHARED_CATEGORIES[number];

const SYMPTOM_OPTIONS = SYMPTOM_CATEGORIES.flatMap(c => c.symptoms);
const BUILT_IN_SET = new Set(SYMPTOM_OPTIONS.map(s => s.toLowerCase()));

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLogWidgetProps {
  userId: string;
  cycleDay?: number;
  phase?: string;
  lastPeriodStart?: string;
  cycleLengthDays?: number;
  isNonCycling?: boolean;
  onLogged?: () => void;
}

interface CommunitySymptom {
  id: string;
  name: string;
  added_by: string;
  created_at: string;
  category: string | null;
}

export function SymptomLogWidget({ userId, cycleDay, phase, lastPeriodStart, cycleLengthDays, isNonCycling, onLogged }: SymptomLogWidgetProps) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<SymptomEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [lastLogTime, setLastLogTime] = useState<string | null>(null);
  const [logDate, setLogDate] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [communitySymptoms, setCommunitySymptoms] = useState<CommunitySymptom[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSymptom, setNewSymptom] = useState("");
  const [addingSymptom, setAddingSymptom] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [search, setSearch] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!userId) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    supabase
      .from("symptom_logs")
      .select("id, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", todayStart.toISOString())
      .order("logged_at", { ascending: false })
      .then(({ data }) => {
        setTodayCount(data?.length || 0);
        if (data && data.length > 0) {
          setLastLogTime(data[0].logged_at);
        }
      });
  }, [userId]);

  useEffect(() => {
    supabase
      .from("community_symptoms")
      .select("id, name, added_by, created_at, category")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          const filtered = (data as any[])
            .filter(s => !BUILT_IN_SET.has(s.name.trim().toLowerCase()))
            .map(s => ({ ...s, category: s.category ?? null })) as CommunitySymptom[];
          setCommunitySymptoms(filtered);
        }
      });
  }, []);

  const handleAddCommunitySymptom = async () => {
    const name = newSymptom.trim();
    if (!name || name.length > 50) return;
    if (
      BUILT_IN_SET.has(name.toLowerCase()) ||
      communitySymptoms.some(s => s.name.toLowerCase() === name.toLowerCase())
    ) {
      toast({ title: "Already on the list", description: "This symptom is already available." });
      setNewSymptom("");
      setShowAddForm(false);
      return;
    }
    setAddingSymptom(true);
    const { data, error } = await supabase
      .from("community_symptoms")
      .insert({ name, added_by: userId })
      .select()
      .single();

    if (error) {
      toast({ title: "Couldn't add", description: error.message, variant: "destructive" });
    } else if (data) {
      setCommunitySymptoms(prev => [data as CommunitySymptom, ...prev]);
      setSelected(prev => [...prev, { name: data.name, severity: 0 }]);
      toast({ title: "Added to the shared list", description: "Other users can see this too 💜" });
      setNewSymptom("");
      setShowAddForm(false);
    }
    setAddingSymptom(false);
  };

  const startEdit = (cs: CommunitySymptom) => {
    setEditingId(cs.id);
    setEditValue(cs.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleSaveEdit = async (cs: CommunitySymptom) => {
    const newName = editValue.trim();
    if (!newName || newName.length > 50) return;
    if (newName.toLowerCase() === cs.name.toLowerCase()) {
      cancelEdit();
      return;
    }
    if (
      BUILT_IN_SET.has(newName.toLowerCase()) ||
      communitySymptoms.some(s => s.id !== cs.id && s.name.toLowerCase() === newName.toLowerCase())
    ) {
      toast({ title: "Already on the list", description: "Pick a different name.", variant: "destructive" });
      return;
    }
    const oldName = cs.name;
    const { error } = await supabase
      .from("community_symptoms")
      .update({ name: newName })
      .eq("id", cs.id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    } else {
      setCommunitySymptoms(prev => prev.map(s => s.id === cs.id ? { ...s, name: newName } : s));
      setSelected(prev => prev.map(s => s.name === oldName ? { ...s, name: newName } : s));
      toast({ title: "Updated" });
      cancelEdit();
    }
  };

  const handleDeleteSymptom = async (cs: CommunitySymptom) => {
    if (!confirm(`Remove "${cs.name}" from the shared list?`)) return;
    const { error } = await supabase
      .from("community_symptoms")
      .delete()
      .eq("id", cs.id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
    } else {
      setCommunitySymptoms(prev => prev.filter(s => s.id !== cs.id));
      setSelected(prev => prev.filter(s => s.name !== cs.name));
      toast({ title: "Removed" });
    }
  };

  const toggleSymptom = useCallback((name: string) => {
    setSelected(prev => {
      const existing = prev.find(s => s.name === name);
      if (existing) return prev.filter(s => s.name !== name);
      return [...prev, { name, severity: 0 }];
    });
  }, []);

  const setSeverity = useCallback((name: string, severity: number) => {
    setSelected(prev => prev.map(s => s.name === name ? { ...s, severity } : s));
  }, []);

  const isToday = useMemo(() => {
    const t = new Date();
    return logDate.toDateString() === t.toDateString();
  }, [logDate]);

  // Recompute cycle day/phase for the selected date when backdating
  const effectiveCycleInfo = useMemo(() => {
    if (isNonCycling) return { cycleDay: null as number | null, phase: null as string | null };
    if (isToday) return { cycleDay: cycleDay ?? null, phase: phase ?? null };
    if (lastPeriodStart && cycleLengthDays) {
      const info = calculateCycleInfo(lastPeriodStart, cycleLengthDays, undefined, logDate);
      if (info) return { cycleDay: info.cycleDay, phase: info.phase };
    }
    return { cycleDay: null, phase: null };
  }, [isToday, isNonCycling, cycleDay, phase, lastPeriodStart, cycleLengthDays, logDate]);

  const handleSubmit = async () => {
    if (selected.length === 0 && !notes.trim()) return;
    setSaving(true);

    // Build logged_at: today => now; backdated => noon UTC of selected date
    const loggedAt = isToday
      ? new Date().toISOString()
      : new Date(Date.UTC(logDate.getFullYear(), logDate.getMonth(), logDate.getDate(), 12, 0, 0)).toISOString();

    const { error } = await supabase.from("symptom_logs").insert({
      user_id: userId,
      symptoms: selected as any,
      notes: notes.trim() || null,
      cycle_day: effectiveCycleInfo.cycleDay,
      cycle_phase: effectiveCycleInfo.phase,
      logged_at: loggedAt,
    });

    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: isToday ? "Symptoms logged" : `Logged for ${format(logDate, "MMM d")}`,
        description: `${selected.length} symptom${selected.length !== 1 ? "s" : ""} recorded`,
      });
      setSelected([]);
      setNotes("");
      if (isToday) {
        setTodayCount(prev => prev + 1);
        setLastLogTime(new Date().toISOString());
      }
      setLogDate(new Date());
      onLogged?.();
    }
    setSaving(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="w-full overflow-hidden">
      {/* Header — always visible, no toggle */}
      <div className="w-full flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-primary/70" />
          <div>
            <span className="text-sm font-medium text-foreground/90">Log Symptoms</span>
            {todayCount > 0 && (
              <span className="ml-2 text-[10px] text-muted-foreground">
                {todayCount} today{lastLogTime ? ` · last ${formatTime(lastLogTime)}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3 border-t border-border/20">
          {/* Date picker — log for today or backdate */}
          <div className="pt-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Logging for</span>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs px-2.5"
                >
                  <CalendarIcon className="w-3 h-3" />
                  {isToday ? "Today" : format(logDate, "EEE, MMM d")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={logDate}
                  onSelect={(d) => {
                    if (d) {
                      setLogDate(d);
                      setCalendarOpen(false);
                    }
                  }}
                  disabled={(d) => d > new Date() || d < new Date(Date.now() - 1000 * 60 * 60 * 24 * 90)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {!isToday && (
              <button
                onClick={() => setLogDate(new Date())}
                className="text-[10px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
              >
                reset
              </button>
            )}
            {!isToday && !isNonCycling && effectiveCycleInfo.cycleDay && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                Day {effectiveCycleInfo.cycleDay} · {effectiveCycleInfo.phase}
              </span>
            )}
          </div>

          {/* Symptom chips */}
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                How are you feeling?
              </p>
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search symptoms…"
                className="h-7 text-xs max-w-[180px]"
              />
            </div>

            {/* Selected pinned chips */}
            {selected.length > 0 && (
              <div className="mb-3 pb-2 border-b border-border/20">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-1.5">
                  Selected · {selected.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.map(s => (
                    <button
                      key={s.name}
                      onClick={() => toggleSymptom(s.name)}
                      className="px-2.5 py-1 text-xs rounded-full border bg-primary text-primary-foreground border-primary inline-flex items-center gap-1"
                    >
                      {s.name}
                      <X className="w-3 h-3 opacity-70" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Categorized built-in symptoms (alphabetical within group) */}
            {(() => {
              const q = search.trim().toLowerCase();
              const renderBuiltInChip = (name: string) => {
                const isSelected = selected.some(s => s.name === name);
                return (
                  <button
                    key={name}
                    onClick={() => toggleSymptom(name)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-full border transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card/60 border-border/40 hover:border-primary/40 text-foreground/70"
                    )}
                  >
                    {name}
                  </button>
                );
              };

              return (
                <div className="space-y-2.5">
                  {SYMPTOM_CATEGORIES.map(cat => {
                    const sorted = [...cat.symptoms].sort((a, b) => a.localeCompare(b));
                    const filtered = q ? sorted.filter(n => n.toLowerCase().includes(q)) : sorted;
                    if (filtered.length === 0) return null;
                    const isCollapsed = !q && collapsedCats[cat.label];
                    return (
                      <div key={cat.label}>
                        <button
                          onClick={() => setCollapsedCats(prev => ({ ...prev, [cat.label]: !prev[cat.label] }))}
                          className="w-full flex items-center justify-between mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 hover:text-foreground/80"
                        >
                          <span>{cat.label} · {filtered.length}</span>
                          {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                        </button>
                        {!isCollapsed && (
                          <div className="flex flex-wrap gap-1.5">
                            {filtered.map(renderBuiltInChip)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Community section */}
                  {(() => {
                    const sortedCs = [...communitySymptoms].sort((a, b) => a.name.localeCompare(b.name));
                    const filteredCs = q ? sortedCs.filter(c => c.name.toLowerCase().includes(q)) : sortedCs;
                    if (filteredCs.length === 0 && !showAddForm && q) return null;
                    const isCollapsed = !q && collapsedCats["__community"];
                    return (
                      <div>
                        <button
                          onClick={() => setCollapsedCats(prev => ({ ...prev, __community: !prev.__community }))}
                          className="w-full flex items-center justify-between mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 hover:text-foreground/80"
                        >
                          <span>Shared · {filteredCs.length}</span>
                          {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                        </button>
                        {!isCollapsed && (
                          <div className="flex flex-wrap gap-1.5">
                            {filteredCs.map(cs => {
                              const isSelected = selected.some(s => s.name === cs.name);
                              const isMine = cs.added_by === userId;
                              const isRecent = Date.now() - new Date(cs.created_at).getTime() < 1000 * 60 * 60 * 24 * 14;
                              const isEditing = editingId === cs.id;

                              if (isEditing) {
                                return (
                                  <div key={cs.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-primary/50 bg-card">
                                    <Input
                                      autoFocus
                                      value={editValue}
                                      onChange={e => setEditValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") handleSaveEdit(cs);
                                        if (e.key === "Escape") cancelEdit();
                                      }}
                                      maxLength={50}
                                      className="h-6 text-xs w-32 px-2"
                                    />
                                    <button onClick={() => handleSaveEdit(cs)} className="p-1 rounded-full text-primary hover:bg-primary/10" title="Save">
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button onClick={cancelEdit} className="p-1 rounded-full text-muted-foreground hover:bg-muted" title="Cancel">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={cs.id}
                                  className={cn(
                                    "inline-flex items-center rounded-full border transition-all overflow-hidden",
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-card/60 border-border/40 hover:border-primary/40 text-foreground/70"
                                  )}
                                  title={isMine ? "You added this" : "Added by another user"}
                                >
                                  <button onClick={() => toggleSymptom(cs.name)} className="px-2.5 py-1 text-xs inline-flex items-center gap-1.5">
                                    {cs.name}
                                    {isRecent && (
                                      <span className={cn(
                                        "inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded-full",
                                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent/40 text-accent-foreground/80"
                                      )}>
                                        <Sparkles className="w-2 h-2" />
                                        new
                                      </span>
                                    )}
                                  </button>
                                  {isMine && (
                                    <>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); startEdit(cs); }}
                                        className={cn("px-1.5 py-1 hover:bg-black/10", isSelected ? "text-primary-foreground/80" : "text-muted-foreground hover:text-foreground")}
                                        title="Edit"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteSymptom(cs); }}
                                        className={cn("px-1.5 py-1 hover:bg-destructive/20", isSelected ? "text-primary-foreground/80" : "text-muted-foreground hover:text-destructive")}
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {!showAddForm && (
                              <button
                                onClick={() => setShowAddForm(true)}
                                className="px-2.5 py-1 text-xs rounded-full border border-dashed border-primary/40 text-primary/80 hover:bg-primary/5 transition-all inline-flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                Add yours
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Empty search state */}
                  {q && SYMPTOM_CATEGORIES.every(c => !c.symptoms.some(n => n.toLowerCase().includes(q)))
                    && !communitySymptoms.some(c => c.name.toLowerCase().includes(q)) && (
                    <div className="py-3 text-center">
                      <p className="text-xs text-muted-foreground mb-2">No matches for "{search}"</p>
                      <button
                        onClick={() => { setNewSymptom(search); setShowAddForm(true); setSearch(""); }}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add "{search}" as a new symptom
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
            {showAddForm && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  autoFocus
                  value={newSymptom}
                  onChange={e => setNewSymptom(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleAddCommunitySymptom();
                    if (e.key === "Escape") { setShowAddForm(false); setNewSymptom(""); }
                  }}
                  placeholder="e.g. Tingly hands, vivid dreams..."
                  maxLength={50}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  onClick={handleAddCommunitySymptom}
                  disabled={addingSymptom || !newSymptom.trim()}
                  className="h-8 text-xs"
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowAddForm(false); setNewSymptom(""); }}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Symptoms you add are shared with other users (no personal info attached).
            </p>
          </div>

          {/* Severity sliders for selected symptoms */}
          {selected.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                Severity (0 = not feeling it, 5 = severe)
              </p>
              {selected.map(entry => (
                <div key={entry.name} className="flex items-center gap-3">
                  <span className="text-xs text-foreground/70 w-28 truncate">{entry.name}</span>
                  <Slider
                    min={0}
                    max={5}
                    step={1}
                    value={[entry.severity]}
                    onValueChange={([v]) => setSeverity(entry.name, v)}
                    className="flex-1"
                  />
                  <span className="text-xs font-medium text-muted-foreground w-4 text-right">
                    {entry.severity}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                Notes
              </label>
              <span className="text-[10px] text-muted-foreground/60">Searchable later</span>
            </div>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Unusual sharp pain on left side, weird metallic taste, vivid dream about… anything you'd want to find again later."
              className="resize-none text-xs"
              rows={3}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={saving || (selected.length === 0 && !notes.trim())}
              className="gap-1.5 text-xs"
            >
              {saving ? "Saving..." : (
                <>
                  <Check className="w-3 h-3" />
                  Log {selected.length > 0 ? `${selected.length} symptom${selected.length !== 1 ? "s" : ""}` : "note"}
                </>
              )}
            </Button>
          </div>
        </div>
    </div>
  );
}
