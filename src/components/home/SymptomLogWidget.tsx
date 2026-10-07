import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Activity, Plus, Sparkles, Pencil, Trash2, X, CalendarIcon, EyeOff, Eye, Star, Flag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cleanSymptomLabel, truncateAtWord } from "@/lib/symptomLabel";
import { findNearDuplicate } from "@/lib/symptomDedupe";
import { ReportSymptomDialog } from "@/components/home/ReportSymptomDialog";
import { GROUPED, SYMPTOM_GROUPS, aliasesOf, canonicalSymptom, groupOf, isKnownSymptom, loadAliases, normSymptom, sameSymptom, sentenceCase } from "@/lib/symptomCatalog";
import { validateSymptomName, suggestExistingSymptoms, MAX_PENDING_PER_DAY, MAX_SYMPTOM_LENGTH } from "@/lib/symptomModeration";


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

// Unified picker category order — built-in defaults and community entries
// render together in one continuous list (no origin split).
const UNIFIED_CATEGORIES = [
  "Physical",
  "Emotional",
  "Energy & focus",
  "Sleep & Energy",
  "Mood & Cognitive",
  "Skin & Body",
  "Digestive",
  "Ear/Nose/Throat",
  "Reproductive & Discharge",
  "Pain",
  "Other",
] as const;

const SEVERITIES = [{ label: "Mild", value: 1 }, { label: "Moderate", value: 3 }, { label: "Strong", value: 5 }] as const;
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
  initialSymptom?: string;
  onLogged?: (entry: { symptoms: { name: string; severity: number }[]; notes: string; isToday: boolean }) => void;
}

interface CommunitySymptom {
  id: string;
  name: string;
  added_by: string;
  created_at: string;
  category: string | null;
  status?: string;
  aliases?: string[] | null;
}

export function SymptomLogWidget({ userId, cycleDay, phase, lastPeriodStart, cycleLengthDays, isNonCycling, initialSymptom, onLogged }: SymptomLogWidgetProps) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<SymptomEntry[]>(() => initialSymptom ? [{ name: canonicalSymptom(initialSymptom), severity: 1 }] : []);
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
  const [addError, setAddError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [search, setSearch] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [previouslyLoggedNames, setPreviouslyLoggedNames] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [frequentNames, setFrequentNames] = useState<string[]>([]);
  // Lowercased names that exist in the shared table but aren't shown (retired/merged),
  // mapped to their live canonical name when there is one.
  const [retiredNames, setRetiredNames] = useState<Map<string, string | null>>(new Map());

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

  // Fetch user's previously-logged symptom names to decide which SHARED categories default-open
  useEffect(() => {
    if (!userId) return;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("symptom_logs")
      .select("symptoms, logged_at")
      .eq("user_id", userId)
      .order("logged_at", { ascending: false })
      .limit(400)
      .then(({ data }) => {
        const names = new Set<string>();
        const counts = new Map<string, number>();
        (data ?? []).forEach((row: any) => {
          const arr = Array.isArray(row.symptoms) ? row.symptoms : [];
          const withinWindow = row.logged_at && row.logged_at >= ninetyDaysAgo;
          arr.forEach((s: any) => {
            const n = typeof s === "string" ? s : s?.name;
            if (!n) return;
            const key = canonicalSymptom(String(n));
            names.add(key.toLowerCase());
            if (withinWindow) counts.set(key, (counts.get(key) || 0) + 1);
          });
        });
        setPreviouslyLoggedNames(names);
        const top = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([n]) => n);
        setFrequentNames(top);
      });
  }, [userId]);

  // Fetch this user's hidden community symptoms
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_hidden_symptoms" as any)
      .select("community_symptom_id")
      .eq("user_id", userId)
      .then(({ data }) => {
        setHiddenIds(new Set((data ?? []).map((r: any) => r.community_symptom_id)));
      });
  }, [userId]);

  useEffect(() => {
    supabase
      .from("community_symptoms")
      .select("id, name, added_by, created_at, category, status, aliases, submitted_by, canonical_id, deleted_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const rows = data as any[];
        const live = rows
          // Merged, deprecated and retired entries never show; everything live is shared.
          .filter(s => s.status === "approved" && !s.deleted_at)
          .filter(s => !BUILT_IN_SET.has(s.name.trim().toLowerCase()))
          .map(s => ({ ...s, category: s.category ?? null })) as CommunitySymptom[];
        setCommunitySymptoms(live);

        // Names that exist in the table but aren't shown. The unique constraint
        // still covers them, so treat them as taken during the match pass.
        const liveNames = new Set(live.map(s => s.name.trim().toLowerCase()));
        const byId = new Map(rows.map(r => [r.id, r]));
        const retired = new Map<string, string | null>();
        rows.forEach(r => {
          const key = r.name.trim().toLowerCase();
          if (liveNames.has(key) || BUILT_IN_SET.has(key)) return;
          const canonical = r.canonical_id ? byId.get(r.canonical_id) : null;
          const canonicalLive =
            canonical && canonical.status === "approved" && !canonical.deleted_at
              ? canonical.name
              : null;
          retired.set(key, canonicalLive);
        });
        setRetiredNames(retired);
      });
  }, [userId]);

  const approvedEntries = useMemo(
    () => [
      ...SYMPTOM_OPTIONS.map(n => ({ name: n, aliases: null as string[] | null })),
      ...communitySymptoms.map(s => ({ name: s.name, aliases: s.aliases ?? null })),
    ],
    [communitySymptoms],
  );

  const selectExisting = (name: string) => {
    setSelected(prev =>
      prev.some(s => s.name.toLowerCase() === name.toLowerCase()) ? prev : [...prev, { name, severity: 0 }]
    );
    setNewSymptom("");
    setAddError(null);
    setSuggestions([]);
    setShowAddForm(false);
  };

  // Step 1: fuzzy-match against approved names + aliases and surface matches
  // before anything is created. Only "Add as new" gets past this.
  const handleCheckNewSymptom = () => {
    const check = validateSymptomName(newSymptom);
    if (!check.ok) {
      setAddError(check.message ?? "That entry isn't allowed.");
      setSuggestions([]);
      return;
    }
    setAddError(null);
    const existingNames = approvedEntries.map(e => e.name);
    const exact = existingNames.find(n => n.toLowerCase() === check.value.toLowerCase());
    if (exact) {
      selectExisting(exact);
      toast({ title: "Already on the list", description: `We've selected "${exact}" for you.` });
      return;
    }
    // The name may exist as a hidden/retired row — inserting it would hit the
    // unique constraint, so resolve it here instead.
    if (retiredNames.has(check.value.toLowerCase())) {
      handleTakenName(check.value);
      return;
    }
    const matches = suggestExistingSymptoms(check.value, approvedEntries);
    const near = findNearDuplicate(check.value, existingNames);
    const names = Array.from(new Set([...(near ? [near] : []), ...matches.map(m => m.name)]));
    if (names.length > 0) {
      setSuggestions(names);
      return;
    }
    handleAddCommunitySymptom();
  };

  // Shared landing spot for "this name already exists in the shared table":
  // point at the surviving canonical entry, or just let her log the name itself.
  const handleTakenName = (name: string) => {
    const canonical = retiredNames.get(name.toLowerCase()) ?? null;
    if (canonical) {
      setSuggestions([canonical]);
      setAddError(null);
      return;
    }
    selectExisting(name);
    toast({ title: "Already tracked", description: `We've selected "${name}" for you.` });
  };

  // Step 2: guardrails passed and the user confirmed it's genuinely new.
  const handleAddCommunitySymptom = async () => {
    const check = validateSymptomName(newSymptom);
    if (!check.ok) {
      setAddError(check.message ?? "That entry isn't allowed.");
      return;
    }
    const name = check.value;

    setAddingSymptom(true);
    // Rolling 24h cap (also enforced server-side).
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("community_symptoms")
      .select("id", { count: "exact", head: true })
      .eq("submitted_by", userId)
      .gte("created_at", since);

    if ((count ?? 0) >= MAX_PENDING_PER_DAY) {
      setAddingSymptom(false);
      setAddError(`You can submit ${MAX_PENDING_PER_DAY} new symptoms per day. Try again tomorrow.`);
      return;
    }

    const { data, error } = await supabase
      .from("community_symptoms")
      .insert({ name, added_by: userId, submitted_by: userId, status: "approved" })
      .select()
      .single();

    if (error) {
      const isDuplicate =
        (error as any).code === "23505" || /duplicate key|unique constraint/i.test(error.message);
      if (isDuplicate) {
        setAddingSymptom(false);
        handleTakenName(name);
        return;
      }
      setAddError(
        /rate_limited/i.test(error.message)
          ? `You can submit ${MAX_PENDING_PER_DAY} new symptoms per day. Try again tomorrow.`
          : "Couldn't add that one right now. Try again."
      );
    } else if (data) {
      setCommunitySymptoms(prev => [data as CommunitySymptom, ...prev]);
      setSelected(prev => [...prev, { name: data.name, severity: 0 }]);
      toast({
        title: "Added to the shared list",
        description: "It's live for everyone right away.",
      });
      setNewSymptom("");
      setAddError(null);
      setSuggestions([]);
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
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", cs.id);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
    } else {
      setCommunitySymptoms(prev => prev.filter(s => s.id !== cs.id));
      setSelected(prev => prev.filter(s => s.name !== cs.name));
      toast({ title: "Removed" });
    }
  };

  const handleHideSymptom = async (cs: CommunitySymptom) => {
    setHiddenIds(prev => new Set(prev).add(cs.id));
    setSelected(prev => prev.filter(s => s.name !== cs.name));
    const { error } = await supabase
      .from("user_hidden_symptoms" as any)
      .insert({ user_id: userId, community_symptom_id: cs.id });
    if (error && !/duplicate/i.test(error.message)) {
      toast({ title: "Couldn't hide", description: error.message, variant: "destructive" });
      setHiddenIds(prev => { const n = new Set(prev); n.delete(cs.id); return n; });
    }
  };

  const handleUnhideSymptom = async (cs: CommunitySymptom) => {
    setHiddenIds(prev => { const n = new Set(prev); n.delete(cs.id); return n; });
    const { error } = await supabase
      .from("user_hidden_symptoms" as any)
      .delete()
      .eq("user_id", userId)
      .eq("community_symptom_id", cs.id);
    if (error) {
      toast({ title: "Couldn't unhide", description: error.message, variant: "destructive" });
      setHiddenIds(prev => new Set(prev).add(cs.id));
    }
  };

  const toggleSymptom = useCallback((name: string) => {
    setSelected(prev => {
      const existing = prev.find(s => sameSymptom(s.name, name));
      if (existing) return prev.filter(s => s !== existing);
      return [...prev, { name: canonicalSymptom(name), severity: 1 }];
    });
  }, []);

  // Deep-link target (e.g. post-onboarding walkthrough "Log it now" chip):
  // open today's logging view pre-filled with the given symptom and scroll here.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const symptom = (e as CustomEvent).detail?.symptom as string | null | undefined;
      setExpanded(true);
      setLogDate(new Date());
      if (symptom) {
        const name = canonicalSymptom(String(symptom));
        setSelected(prev =>
          prev.some(s => sameSymptom(s.name, name)) ? prev : [...prev, { name, severity: 1 }]
        );
      }
      setTimeout(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    };
    window.addEventListener("logan:open-symptom-log", handler);
    return () => window.removeEventListener("logan:open-symptom-log", handler);
  }, []);

  useEffect(() => { loadAliases().then(() => setSelected(prev => prev.map(s => ({ ...s, name: canonicalSymptom(s.name) })))); }, []);

  const addOwn = () => {
    const check = validateSymptomName(search);
    if (!check.ok) { setAddError(check.message ?? "That entry isn't allowed."); return; }
    const name = canonicalSymptom(check.value);
    setSelected(prev => prev.some(s => sameSymptom(s.name, name)) ? prev : [...prev, { name, severity: 1 }]);
    setSearch(""); setAddError(null);
  };

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

    const { data: savedRow, error } = await supabase.from("symptom_logs").insert({
      user_id: userId,
      symptoms: selected as any,
      notes: notes.trim() || null,
      cycle_day: effectiveCycleInfo.cycleDay,
      cycle_phase: effectiveCycleInfo.phase,
      logged_at: loggedAt,
    }).select("id").maybeSingle();

    if (error || !savedRow) {
      toast({ title: "Failed to save", description: error?.message ?? "Try again.", variant: "destructive" });
    } else {
      toast({
        title: isToday ? "Symptoms logged" : `Logged for ${format(logDate, "MMM d")}`,
        description: `${selected.length} symptom${selected.length !== 1 ? "s" : ""} recorded`,
      });
      const savedEntry = { symptoms: selected.map(s => ({ name: s.name, severity: s.severity })), notes: notes.trim(), isToday };
      setSelected([]);
      setNotes("");
      if (isToday) {
        setTodayCount(prev => prev + 1);
        setLastLogTime(new Date().toISOString());
      }
      setLogDate(new Date());
      onLogged?.(savedEntry);
    }
    setSaving(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <div ref={rootRef} className="w-full overflow-hidden">
      {/* Header — always visible, no toggle */}
      <div className="w-full flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-primary/70" />
          <div>
            <span className="text-sm font-medium text-foreground/90">Log symptoms</span>
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
          <div className="space-y-3">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search or add your own"
              className="h-11 w-full rounded-full text-sm"
              aria-label="Search or add your own"
            />
            {(() => {
              const q = normSymptom(search);
              const matches = (name: string) => !q || normSymptom(name).includes(q) || aliasesOf(name).some(a => a.includes(q));
              const used = new Set<string>();
              const take = (names: string[]) => names.filter(n => {
                const k = normSymptom(n);
                if (used.has(k) || !matches(n)) return false;
                used.add(k); return true;
              });
              const frequent = take(frequentNames.slice(0, 6));
              const groups = SYMPTOM_GROUPS.map(g => {
                const shared = communitySymptoms.filter(c => groupOf(c.name) === null && c.category === g).map(c => sentenceCase(cleanSymptomLabel(c.name)));
                return { label: g as string, names: take([...GROUPED[g], ...shared].sort((a, b) => a.localeCompare(b))) };
              });
              const words = take([...previouslyLoggedNames].filter(n => !isKnownSymptom(n)).map(n => sentenceCase(n)).sort((a, b) => a.localeCompare(b)));
              if (words.length) groups.push({ label: "Your words", names: words });
              const exact = q && ([...used].includes(q) || isKnownSymptom(q));
              const anyHit = used.size > 0;

              const chip = (name: string) => {
                const entry = selected.find(s => sameSymptom(s.name, name));
                return (
                  <div key={name} className={cn("flex flex-col gap-1.5", entry ? "w-full items-start" : "inline-flex")}>
                    <button type="button" onClick={() => toggleSymptom(name)} aria-pressed={!!entry}
                      className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors",
                        entry ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground")}>
                      {name}
                    </button>
                    {entry && (
                      <div className="flex gap-1.5 pl-1" role="radiogroup" aria-label={`How strong is ${name}?`}>
                        {SEVERITIES.map(sv => {
                          const on = entry.severity === sv.value;
                          return (
                            <button key={sv.label} type="button" role="radio" aria-checked={on} onClick={() => setSeverity(entry.name, sv.value)}
                              className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
                                on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground")}>
                              {on && <Check className="h-3 w-3" aria-hidden />}{sv.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div className="space-y-3">
                  {frequent.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Frequently logged</p>
                      <div className="flex flex-wrap gap-1.5">{frequent.map(chip)}</div>
                    </div>
                  )}
                  {groups.map((g, i) => {
                    if (g.names.length === 0) return null;
                    const open = q ? true : (g.label in collapsedCats ? !collapsedCats[g.label] : i === 0);
                    return (
                      <div key={g.label}>
                        <button type="button" onClick={() => setCollapsedCats(prev => ({ ...prev, [g.label]: open }))}
                          className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold text-muted-foreground" aria-expanded={open}>
                          <span>{g.label}</span>
                          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {open && <div className="flex flex-wrap gap-1.5">{g.names.map(chip)}</div>}
                      </div>
                    );
                  })}
                  {q && !exact && (
                    <div className="space-y-1.5">
                      {!anyHit && <p className="text-xs text-muted-foreground">Not on the list yet.</p>}
                      <button type="button" onClick={addOwn}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-foreground/40 px-3 py-1.5 text-sm text-foreground">
                        <Plus className="h-3.5 w-3.5" /> Add "{sentenceCase(search)}" as your own
                      </button>
                      {addError && <p className="text-xs text-destructive">{addError}</p>}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

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
          <Button onClick={handleSubmit} disabled={saving || (selected.length === 0 && !notes.trim())}
            className="h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90">
            {saving ? "Saving..." : selected.length > 0 ? `Log ${selected.length}` : "Log note"}
          </Button>
        </div>
        <ReportSymptomDialog
          symptom={reportTarget}
          userId={userId}
          onOpenChange={(o) => { if (!o) setReportTarget(null); }}
        />
    </div>

  );
}
