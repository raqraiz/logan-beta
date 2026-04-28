import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Activity, Plus, Sparkles, Pencil, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const SYMPTOM_OPTIONS = [
  // Physical
  "Cramps", "Bloating", "Headache", "Fatigue", "Back pain",
  "Breast tenderness", "Nausea", "Acne", "Joint pain", "Insomnia",
  // Emotional
  "Mood swings", "Anxiety", "Irritability", "Brain fog", "Low motivation",
  "Sadness", "Restlessness", "Overwhelm",
  // Energy & performance
  "High energy", "Low energy", "Sharp focus", "Poor focus",
  // Other
  "Cravings", "Hot flashes", "Night sweats", "Spotting",
];

const BUILT_IN_SET = new Set(SYMPTOM_OPTIONS.map(s => s.toLowerCase()));

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLogWidgetProps {
  userId: string;
  cycleDay?: number;
  phase?: string;
  onLogged?: () => void;
}

interface CommunitySymptom {
  id: string;
  name: string;
  added_by: string;
  created_at: string;
}

export function SymptomLogWidget({ userId, cycleDay, phase, onLogged }: SymptomLogWidgetProps) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<SymptomEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [lastLogTime, setLastLogTime] = useState<string | null>(null);
  const [communitySymptoms, setCommunitySymptoms] = useState<CommunitySymptom[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSymptom, setNewSymptom] = useState("");
  const [addingSymptom, setAddingSymptom] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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
      .select("id, name, added_by, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) {
          const filtered = data.filter(s => !BUILT_IN_SET.has(s.name.trim().toLowerCase()));
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
      toast({ title: "Added to the community list", description: "Others can see this too 💜" });
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
    if (!confirm(`Remove "${cs.name}" from the community list?`)) return;
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

  const handleSubmit = async () => {
    if (selected.length === 0 && !notes.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("symptom_logs").insert({
      user_id: userId,
      symptoms: selected as any,
      notes: notes.trim() || null,
      cycle_day: cycleDay || null,
      cycle_phase: phase || null,
    });

    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Symptoms logged", description: `${selected.length} symptom${selected.length !== 1 ? "s" : ""} recorded` });
      setSelected([]);
      setNotes("");
      
      setTodayCount(prev => prev + 1);
      setLastLogTime(new Date().toISOString());
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
          {/* Symptom chips */}
          <div className="pt-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">
              How are you feeling?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SYMPTOM_OPTIONS.map(name => {
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
              })}
              {communitySymptoms.map(cs => {
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
                      <button
                        onClick={() => handleSaveEdit(cs)}
                        className="p-1 rounded-full text-primary hover:bg-primary/10"
                        title="Save"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 rounded-full text-muted-foreground hover:bg-muted"
                        title="Cancel"
                      >
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
                    title={isMine ? "You added this" : "Added by the community"}
                  >
                    <button
                      onClick={() => toggleSymptom(cs.name)}
                      className="px-2.5 py-1 text-xs inline-flex items-center gap-1.5"
                    >
                      {cs.name}
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded-full",
                          isSelected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-accent/40 text-accent-foreground/80"
                        )}
                      >
                        <Sparkles className="w-2 h-2" />
                        {isRecent ? "new" : "community"}
                      </span>
                    </button>
                    {isMine && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(cs); }}
                          className={cn(
                            "px-1.5 py-1 hover:bg-black/10",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground hover:text-foreground"
                          )}
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSymptom(cs); }}
                          className={cn(
                            "px-1.5 py-1 hover:bg-destructive/20",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground hover:text-destructive"
                          )}
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
              Symptoms you add are shared with the community (no personal info attached).
            </p>
          </div>

          {/* Severity sliders for selected symptoms */}
          {selected.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
                Severity (1 = mild, 5 = severe)
              </p>
              {selected.map(entry => (
                <div key={entry.name} className="flex items-center gap-3">
                  <span className="text-xs text-foreground/70 w-28 truncate">{entry.name}</span>
                  <Slider
                    min={1}
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
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything else? Patterns, triggers, how you feel overall..."
            className="resize-none text-xs"
            rows={2}
          />

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
