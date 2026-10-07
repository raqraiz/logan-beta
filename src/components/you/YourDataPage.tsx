import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { CycleAnalytics } from "@/components/chat/CycleAnalytics";
import { YourPatterns } from "@/components/you/YourPatterns";
import { MemorySection } from "@/components/settings/MemorySection";
import { EditMemoryPage, usedForFact } from "@/components/you/EditMemoryPage";
import { supabase } from "@/integrations/supabase/client";
import { PATTERNS_CHANGED } from "@/lib/patternCycles";
import type { WidgetConfig } from "@/hooks/useWidgetPreferences";
import { toast } from "sonner";

interface Props {
  userId: string; cycle: { cycleLengthDays: number; cycleDay: number; phase: string; lastPeriodStart?: string; lifeStage?: "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant"; dueDate?: string; pregnancyLmp?: string };
  isNonCycling: boolean; onClose: () => void; onLog: (symptom?: string) => void;
  onSettings: () => void; onPeople: () => void; widgets: WidgetConfig[]; onTrackers: () => void; onWeight?: () => void;
}
interface Fact { key: string; text: string; source: string; value?: string; kind: "field" | "settings" | "people" }
const fields = "age, anchor_symptom, goals, typical_symptoms, additional_notes, birth_control_method, on_hormonal_bc";
const clearFacts = { age: null, anchor_symptom: null, goals: [], typical_symptoms: [], additional_notes: null, birth_control_method: null, on_hormonal_bc: null, watch_symptoms: [] };

export function YourDataPage({ userId, cycle, isNonCycling, onClose, onLog, onSettings, onPeople, widgets, onTrackers, onWeight }: Props) {
  const [tab, setTab] = useState<"Cycles" | "Patterns" | "Facts">("Cycles");
  const [facts, setFacts] = useState<Fact[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(false);
  const [edit, setEdit] = useState<Fact | null>(null);
  const [draftText, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape" && !confirm && !edit) closeRef.current(); };
    globalThis.addEventListener("keydown", handle);
    return () => { document.body.style.overflow = prev; globalThis.removeEventListener("keydown", handle); };
  }, [confirm, edit]);
  const load = useCallback(async () => {
    const [participant, people] = await Promise.all([
      supabase.from("participants").select(fields).eq("user_id", userId).maybeSingle(),
      supabase.from("headsup_people").select("id, name, relationship").eq("user_id", userId),
    ]);
    setError(!!participant.error || !!people.error);
    if (participant.error || people.error) return;
    const p = participant.data; const list: Fact[] = [];
    // Structured fields do not retain origin metadata: never invent chat dates or onboarding sources.
    const source = "From your profile";
    if (p?.age) list.push({ key: "age", text: `${p.age} years old`, value: String(p.age), source, kind: "field" });
    if (p?.birth_control_method) list.push({ key: "birth_control_method", text: p.birth_control_method === "hormonal_iud" ? "Hormonal IUD" : p.birth_control_method.replace(/_/g, " "), source, kind: "settings" });
    if (p?.anchor_symptom) list.push({ key: "anchor_symptom", text: `${p.anchor_symptom} bothers you most`, value: p.anchor_symptom, source, kind: "field" });
    for (const key of ["goals", "typical_symptoms"] as const) if (p?.[key]?.length) list.push({ key, text: `${key === "goals" ? "Your goals" : "Symptoms you notice"}: ${p[key].join(", ")}`, value: p[key].join(", "), source, kind: "field" });
    if (p?.additional_notes) list.push({ key: "additional_notes", text: p.additional_notes, value: p.additional_notes, source, kind: "field" });
    for (const person of people.data ?? []) list.push({ key: person.id, text: person.relationship ? `${person.name} is your ${person.relationship}` : person.name, source: "From your people", kind: "people" });
    setFacts(list);
  }, [userId]);
  useEffect(() => { void load(); }, [load, refresh]);
  const forgetField = async (f: Fact) => {
    const empty = ["goals", "typical_symptoms"].includes(f.key) ? [] : null;
    const tomb = await supabase.from("user_memory_notes").insert({ user_id: userId, note: f.text, source: "forgotten", active: false });
    const { error } = await supabase.from("participants").update({ [f.key]: empty }).eq("user_id", userId);
    const { data } = await supabase.from("participants").select(fields).eq("user_id", userId).maybeSingle();
    if (tomb.error || error || JSON.stringify((data as unknown as Record<string, unknown> | null)?.[f.key] ?? null) !== JSON.stringify(empty)) { toast.error("That didn't save. Try again."); return false; }
    setEdit(null); toast("Forgotten."); await load(); return true;
  };
  const save = async (text?: string) => {
    const draft = text ?? draftText;
    if (!edit || !draft.trim()) return false;
    const value = edit.key === "age" ? Number(draft) : ["goals", "typical_symptoms"].includes(edit.key) ? draft.split(",").map((s) => s.trim()).filter(Boolean) : draft.trim();
    if (edit.key === "age" && (!Number.isInteger(value) || Number(value) < 18 || Number(value) > 120)) { toast.error("Please enter an age from 18 to 120."); return false; }
    setBusy(true);
    const { error } = await supabase.from("participants").update({ [edit.key]: value }).eq("user_id", userId);
    const { data, error: readError } = await supabase.from("participants").select(fields).eq("user_id", userId).maybeSingle();
    setBusy(false);
    if (error || readError || !data || JSON.stringify((data as unknown as Record<string, unknown>)[edit.key]) !== JSON.stringify(value)) { toast.error("That didn't save. Try again."); return false; }
    setEdit(null); await load(); return true;
  };
  const deleteMemory = async () => {
    setBusy(true);
    try {
      const updated = await supabase.from("participants").update(clearFacts).eq("user_id", userId).select("id");
      if (updated.error) throw updated.error;
      for (const table of ["user_memory_notes", "headsup_people", "partner_headsup_settings", "partner_headsup_style_examples"] as const) {
        const result = await supabase.from(table).delete().eq("user_id", userId); if (result.error) throw result.error;
      }
      const participant = await supabase.from("participants").select(`${fields}, watch_symptoms`).eq("user_id", userId).maybeSingle();
      if (participant.error) throw participant.error;
      if (participant.data && Object.entries(clearFacts).some(([key, value]) => JSON.stringify((participant.data as unknown as Record<string, unknown>)[key]) !== JSON.stringify(value))) throw new Error("Unverified");
      for (const table of ["user_memory_notes", "headsup_people", "partner_headsup_settings", "partner_headsup_style_examples"] as const) {
        const check = await supabase.from(table).select("id").eq("user_id", userId).limit(1); if (check.error || check.data?.length) throw new Error("Unverified");
      }
      globalThis.dispatchEvent(new Event(PATTERNS_CHANGED));
      setRefresh((r) => r + 1); setConfirm(false); toast("Saved facts and people deleted.");
    } catch { toast.error("I couldn't confirm everything was deleted. Please check your facts and try again."); setRefresh((r) => r + 1); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-40 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="Your data" data-private>
    <div className="mx-auto max-w-lg px-5 pt-5 pb-[calc(120px+env(safe-area-inset-bottom))]">
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-full shadow-none" aria-label="Back to You" onClick={onClose}><ArrowLeft /></Button>
      <h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.1] text-foreground">Your data</h1>
      <p className="mt-2 text-base font-light text-muted-foreground">What Logan remembers about you. You decide what stays.</p>
      <div className="my-6 grid grid-cols-3 gap-1" role="tablist" aria-label="Your data views">
        {(["Cycles", "Patterns", "Facts"] as const).map((name) => <Button key={name} variant="ghost" role="tab" id={`data-tab-${name}`} aria-controls={`data-panel-${name}`} aria-selected={name === tab} className={`rounded-full px-2 font-semibold ${name === tab ? "bg-foreground text-background hover:bg-foreground hover:text-background" : "text-foreground"}`} onClick={() => setTab(name)}>{name === tab && <Check className="h-3 w-3" />}{name}</Button>)}
      </div>
      <div role="tabpanel" id={`data-panel-${tab}`} aria-labelledby={`data-tab-${tab}`} className="space-y-5">
        {tab === "Cycles" && <CycleAnalytics embedded open onOpenChange={() => {}} userId={userId} currentCycleLength={cycle.cycleLengthDays} currentCycleDay={cycle.cycleDay} currentPhase={cycle.phase} lifeStage={cycle.lifeStage} dueDate={cycle.dueDate} pregnancyLmp={cycle.pregnancyLmp} />}
        {tab === "Patterns" && <><YourPatterns fullList userId={userId} lastPeriodStart={cycle.lastPeriodStart} cycleLengthDays={cycle.cycleLengthDays} isNonCycling={isNonCycling} lifeStage={cycle.lifeStage} onLogFeeling={onLog} /><MemorySection userId={userId} view="hidden" refresh={refresh} /></>}
        {tab === "Facts" && <>
          {error && <p className="text-sm text-muted-foreground">I couldn't load your profile facts. <Button variant="link" onClick={load}>Try again</Button></p>}
          <MemorySection userId={userId} view="facts" refresh={refresh} hideEmpty={facts.length > 0} />
          {facts.length > 0 && <div className="overflow-hidden rounded-[22px] bg-card">{facts.map((fact) => <Button key={fact.key} variant="ghost" className="h-auto w-full justify-between whitespace-normal rounded-none border-b border-border px-5 py-4 text-left last:border-0" onClick={() => fact.kind === "settings" ? onSettings() : fact.kind === "people" ? onPeople() : (setEdit(fact), setDraft(fact.value ?? ""))}><span className="min-w-0 text-sm">{fact.text}<span className="mt-1 block text-xs font-normal text-muted-foreground">{fact.source}</span></span><ChevronRight /></Button>)}</div>}
          <div className="overflow-hidden rounded-[22px] bg-card">{[{ id: "weight_trend", label: "Weight tracking" }, { id: "nutrition_today", label: "Nutrition tracking" }, { id: "discharge_tracker", label: "Fluid tracking" }].map((tracker) => <Button key={tracker.id} variant="ghost" className="h-auto w-full justify-between rounded-none border-b border-border px-5 py-4 last:border-0" onClick={tracker.id === "weight_trend" && onWeight ? onWeight : onTrackers}><span>{tracker.label} · {widgets.find((w) => w.id === tracker.id)?.visible ? "On" : "Off"}</span><ChevronRight /></Button>)}</div>
        </>}
      </div>
      <Button variant="link" className="mt-8 h-auto px-0 text-foreground underline" onClick={() => setConfirm(true)}>Delete all memory</Button>
    </div>
    {edit && <EditMemoryPage value={edit.value ?? edit.text} source={edit.source} usedFor={usedForFact(edit.key)} onClose={() => setEdit(null)} onSave={(t) => save(t)} onForget={() => forgetField(edit)} />}
    <AlertDialog open={confirm} onOpenChange={(v) => !busy && setConfirm(v)}><AlertDialogContent className="w-[calc(100%-40px)] rounded-[22px]"><AlertDialogHeader><AlertDialogTitle className="font-display text-3xl">Delete all memory?</AlertDialogTitle><AlertDialogDescription>This deletes everything Logan remembers about you. It can't be undone.</AlertDialogDescription></AlertDialogHeader><p className="text-xs text-muted-foreground">Saved chat facts, profile facts and people will be cleared. Your chat history, period history, health context and tracker records stay.</p><AlertDialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Keep it</Button><Button variant="destructive" disabled={busy} onClick={deleteMemory}>{busy ? "Deleting…" : "Delete everything"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
