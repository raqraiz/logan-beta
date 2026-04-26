import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Activity, Plus, Sparkles } from "lucide-react";
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
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<SymptomEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [lastLogTime, setLastLogTime] = useState<string | null>(null);
  const [communitySymptoms, setCommunitySymptoms] = useState<CommunitySymptom[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSymptom, setNewSymptom] = useState("");
  const [addingSymptom, setAddingSymptom] = useState(false);

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
      setSelected(prev => [...prev, { name: data.name, severity: 3 }]);
      toast({ title: "Added to the community list", description: "Others can see this too 💜" });
      setNewSymptom("");
      setShowAddForm(false);
    }
    setAddingSymptom(false);
  };

  const toggleSymptom = useCallback((name: string) => {
    setSelected(prev => {
      const existing = prev.find(s => s.name === name);
      if (existing) return prev.filter(s => s.name !== name);
      return [...prev, { name, severity: 3 }];
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
      setExpanded(false);
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
    <div className="w-full rounded-xl border border-border/30 bg-card/40 backdrop-blur-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-card/60 transition-colors"
      >
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
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
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
            </div>
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
      )}
    </div>
  );
}
