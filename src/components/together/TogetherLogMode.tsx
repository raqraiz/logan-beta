import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { BubbleField, categoryFill, type Bubble } from "@/components/together/TogetherBoard";
import { GROUPED, SYMPTOM_GROUPS, aliasesOf, canonicalSymptom, isKnownSymptom, loadAliases, normSymptom, sameSymptom, sentenceCase } from "@/lib/symptomCatalog";
import { validateSymptomName } from "@/lib/symptomModeration";
import { useWordPrefs } from "@/hooks/useWordPrefs";
import { mapCategory, type AggRow } from "@/lib/togetherData";
import type { SymptomPageLog } from "@/lib/symptomPage";
import { groupOf } from "@/lib/symptomCatalog";

const SEVERITIES = [{ label: "Mild", value: 1 }, { label: "Moderate", value: 3 }, { label: "Strong", value: 5 }] as const;
const MAX_BUBBLES = 14;

export interface LoggedEntry { symptoms: { name: string; severity: number }[]; isToday: boolean }

/** Her counts per symptom name (aliases folded), with her own words shown through her renames and removals. */
export function herCounts(logs: SymptomPageLog[], prefs: Record<string, string | null>) {
  const m = new Map<string, { name: string; n: number }>();
  for (const l of logs) for (const s of (Array.isArray(l.symptoms) ? l.symptoms : []) as any[]) {
    const raw = typeof s === "string" ? s : s?.name;
    if (!raw || !String(raw).trim() || (typeof s?.severity === "number" && s.severity < 0)) continue;
    let name = canonicalSymptom(String(raw));
    if (!isKnownSymptom(name)) {
      const pref = prefs[normSymptom(name)];
      if (pref === null) continue;
      name = pref ?? sentenceCase(name);
    }
    const k = normSymptom(name);
    const cur = m.get(k) ?? { name, n: 0 };
    cur.n++; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

interface Props {
  userId: string;
  logs: SymptomPageLog[];
  aggRows: AggRow[] | null;
  cycleDay?: number;
  lastPeriodStart?: string;
  cycleLengthDays?: number;
  isNonCycling: boolean;
  preselect?: string;
  onCancel: () => void;
  onLogged: (entry: LoggedEntry) => void;
}

export function TogetherLogMode({ userId, logs, aggRows, cycleDay, lastPeriodStart, cycleLengthDays, isNonCycling, preselect, onCancel, onLogged }: Props) {
  const { prefs, save: savePref } = useWordPrefs(userId);
  const [picked, setPicked] = useState<{ name: string; severity: number }[]>(() => preselect ? [{ name: canonicalSymptom(preselect), severity: 1 }] : []);
  const [search, setSearch] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [calOpen, setCalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [wordsOpen, setWordsOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  useEffect(() => { loadAliases().then(() => setPicked((p) => p.map((s) => ({ ...s, name: canonicalSymptom(s.name) })))); }, []);

  const counts = useMemo(() => herCounts(logs, prefs), [logs, prefs]);
  const often = new Set(counts.slice(0, 6).map((c) => normSymptom(c.name)));
  const isPicked = (n: string) => picked.some((p) => sameSymptom(p.name, n));

  // Same size curve as Mine: her most logged first, then cycle-day suggestions at minimum size.
  const items: Bubble[] = useMemo(() => {
    const out: { name: string; t: number }[] = [];
    const seen = new Set<string>();
    const add = (name: string, t: number) => { const k = normSymptom(canonicalSymptom(name)); if (seen.has(k) || out.length >= MAX_BUBBLES) return; seen.add(k); out.push({ name, t }); };
    const top = counts[0]?.n ?? 1;
    for (const c of counts) add(c.name, Math.sqrt(c.n / top));
    const around = (aggRows ?? []).filter((r) => r.filter === (cycleDay && !isNonCycling ? "cycle_day" : "everyone"))
      .sort((a, b) => (b.women_count ?? 0) - (a.women_count ?? 0));
    for (const r of around) add(canonicalSymptom(r.symptom), 0);
    for (const n of ["Cramps", "Bloating", "Headache", "Fatigue", "Irritability", "Anxiety", "Trouble sleeping", "Breast tenderness", "Low mood", "Brain fog", "Acne", "Cravings", "High energy", "Rested"]) add(n, 0);
    if (preselect && !seen.has(normSymptom(canonicalSymptom(preselect)))) {
      if (out.length >= MAX_BUBBLES) out.pop();
      add(canonicalSymptom(preselect), 0);
    }
    for (const p of picked) add(p.name, 0);
    return out.map((o, i) => ({ id: o.name, label: o.name, t: o.t, selected: isPicked(o.name), fill: categoryFill(mapCategory(groupOf(o.name)) ?? undefined, o.t, i) }));
  }, [counts, aggRows, cycleDay, isNonCycling, preselect, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (name: string) => setPicked((p) => p.some((x) => sameSymptom(x.name, name)) ? p.filter((x) => !sameSymptom(x.name, name)) : [...p, { name: canonicalSymptom(name), severity: 1 }]);

  // Search: catalog names, aliases and her own words.
  const results = useMemo(() => {
    const q = normSymptom(search);
    if (q.length < 2) return [];
    const out: { name: string; hint: string }[] = [];
    const push = (name: string, hint: string) => { if (!out.some((o) => sameSymptom(o.name, name))) out.push({ name, hint }); };
    for (const c of counts) if (normSymptom(c.name).includes(q)) push(c.name, "You log this often");
    for (const g of SYMPTOM_GROUPS) for (const n of GROUPED[g]) {
      if (normSymptom(n).includes(q)) push(n, often.has(normSymptom(n)) ? "You log this often" : "");
      else { const a = aliasesOf(n).find((x) => x.includes(q)); if (a) push(n, `Also called “${a}”`); }
    }
    if (out[0] && !out[0].hint) out[0].hint = "Closest match";
    return out.slice(0, 6);
  }, [search, counts]); // eslint-disable-line react-hooks/exhaustive-deps

  const addOwn = () => {
    const check = validateSymptomName(search);
    if (!check.ok) { setAddError(check.message?.replace(/\s—\s/g, ". ") ?? "That entry isn't allowed."); return; }
    const name = sentenceCase(canonicalSymptom(check.value));
    setPicked((p) => p.some((x) => sameSymptom(x.name, name)) ? p : [...p, { name, severity: 1 }]);
    setSearch(""); setAddError(null);
  };

  const isToday = date.toDateString() === new Date().toDateString();
  const cycleInfo = (() => {
    if (isNonCycling) return { day: null as number | null, phase: null as string | null };
    if (isToday) return { day: cycleDay ?? null, phase: null };
    if (lastPeriodStart && cycleLengthDays) { const i = calculateCycleInfo(lastPeriodStart, cycleLengthDays, undefined, date); if (i) return { day: i.cycleDay, phase: i.phase }; }
    return { day: null, phase: null };
  })();

  const submit = async () => {
    if (!picked.length) return;
    setSaving(true); setSaveError(false);
    const loggedAt = isToday ? new Date().toISOString() : new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12)).toISOString();
    const { data, error } = await supabase.from("symptom_logs").insert({
      user_id: userId, symptoms: picked as any, notes: null, cycle_day: cycleInfo.day, cycle_phase: cycleInfo.phase, logged_at: loggedAt,
    }).select("id").maybeSingle();
    const check = data ? await supabase.from("symptom_logs").select("id").eq("id", data.id).eq("user_id", userId).maybeSingle() : null;
    setSaving(false);
    if (error || !data || !check?.data) { setSaveError(true); return; }
    onLogged({ symptoms: picked, isToday });
  };

  const ownWords = counts.filter((c) => !isKnownSymptom(c.name));

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[28px] font-semibold leading-tight text-foreground">What are you feeling?</h1>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="mt-1 min-h-[32px] text-sm font-semibold text-muted-foreground">Logging for {isToday ? "Today" : format(date, "MMM d")} ⌄</button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setCalOpen(false); } }} disabled={(d) => d > new Date()} />
            </PopoverContent>
          </Popover>
        </div>
        <button type="button" onClick={onCancel} className="min-h-[44px] px-1 text-sm font-semibold text-foreground">Cancel</button>
      </div>

      <div>
        <input value={search} onChange={(e) => { setSearch(e.target.value.slice(0, 40)); setAddError(null); }} placeholder="Search or add your own" aria-label="Search or add your own"
          className="h-12 w-full rounded-full border border-border bg-card px-5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
        {search.trim().length >= 2 && (
          <ul className="mt-2 overflow-hidden rounded-[18px] border border-border bg-card">
            {results.map((r) => (
              <li key={r.name}>
                <button type="button" onClick={() => { if (!isPicked(r.name)) toggle(r.name); setSearch(""); }} className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left">
                  <span className="text-[15px] font-semibold text-foreground">{r.name}</span>
                  {r.hint && <span className="text-xs text-muted-foreground">{r.hint}</span>}
                </button>
              </li>
            ))}
            <li><button type="button" onClick={addOwn} className="w-full px-4 py-3 text-left text-[15px] font-semibold text-foreground">+ Add “{search.trim()}” as your own</button></li>
          </ul>
        )}
        {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}
        <p className="mt-2 text-xs text-muted-foreground">Your own words stay private. If 10 women use the same word, it joins Together.</p>
        {ownWords.length > 0 && <button type="button" onClick={() => setWordsOpen(true)} className="mt-1 text-xs font-semibold text-foreground underline underline-offset-2">Edit your words</button>}
      </div>

      <BubbleField items={items} onTap={toggle} />

      {picked.length > 0 && (
        <ul className="rounded-[22px] border border-border bg-card px-4">
          {picked.map((p) => (
            <li key={p.name} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 last:border-0">
              <span className="text-[15px] font-semibold text-foreground">{p.name}</span>
              <span className="flex gap-1">
                {SEVERITIES.map((s) => {
                  const on = p.severity === s.value;
                  return (
                    <button key={s.label} type="button" role="radio" aria-checked={on} onClick={() => setPicked((all) => all.map((x) => x.name === p.name ? { ...x, severity: s.value } : x))}
                      className={`h-8 rounded-full border px-3 text-xs ${on ? "border-[#23201C] bg-[#23201C] font-bold text-[#F4F1EA] dark:border-foreground dark:bg-foreground dark:text-background" : "border-[#DDD7CC] bg-card font-medium text-foreground dark:border-border"}`}>
                      {on ? `✓ ${s.label}` : s.label}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {saveError && <p className="text-sm text-destructive">That didn't save. Try again.</p>}
      <div className="pt-1">
        <button type="button" disabled={!picked.length || saving} onClick={submit}
          className={`h-12 w-full rounded-full text-[15px] font-semibold ${picked.length ? "bg-foreground text-background" : "bg-[#EEE9DF] text-[#6E675F] dark:bg-muted dark:text-muted-foreground"}`}>
          {picked.length ? `Log ${picked.length}` : "Pick what you feel"}
        </button>
      </div>

      <Drawer open={wordsOpen} onOpenChange={(o) => { setWordsOpen(o); setRenaming(null); }}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle className="font-heading text-2xl">Your words</DrawerTitle></DrawerHeader>
          <div className="px-5 pb-6">
            <p className="mb-3 text-sm text-muted-foreground">Changes apply to future logs. Old logs stay as they are.</p>
            <ul>
              {ownWords.map((w) => {
                const k = normSymptom(Object.keys(prefs).find((o) => prefs[o] === w.name) ?? w.name);
                return (
                  <li key={w.name} className="flex items-center justify-between gap-3 border-b border-border py-3">
                    {renaming === k ? (
                      <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); const v = validateSymptomName(renameValue); if (v.ok) { void savePref(k, sentenceCase(v.value)); setRenaming(null); } }}>
                        <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value.slice(0, 40))} className="h-10 flex-1 rounded-full border border-border bg-card px-4 text-sm text-foreground outline-none" />
                        <button type="submit" className="text-sm font-semibold text-foreground">Save</button>
                      </form>
                    ) : (
                      <>
                        <span className="text-[15px] text-foreground">{w.name}</span>
                        <span className="flex gap-3 text-sm font-semibold">
                          <button type="button" onClick={() => { setRenaming(k); setRenameValue(w.name); }} className="text-foreground">Rename</button>
                          <button type="button" onClick={() => void savePref(k, null)} className="text-muted-foreground">Remove</button>
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
