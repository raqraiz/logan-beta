import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LogOffer {
  symptoms: { name: string; severity?: number }[];
  options: { label: string; days: number }[];
  cycle_day?: number | null;
  cycle_phase?: string | null;
}

type Saved = { label: string; ids: string[] };
const key = (id: string) => `logan:log-offer:${id}`;
const read = (id: string): Saved | "dismissed" | null => {
  try { const v = localStorage.getItem(key(id)); return v ? (v === "dismissed" ? "dismissed" : JSON.parse(v)) : null; } catch { return null; }
};

/** Tap-to-log card under Logan's reply. Nothing is saved until she taps a day option. */
export function LogOfferCard({ userId, messageId, offer }: { userId: string; messageId: string; offer: LogOffer }) {
  const [state, setState] = useState(() => read(messageId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (state === "dismissed" || !offer?.symptoms?.length) return null;

  // Use the log's own names: match the shared symptom list, add it there if it's new.
  const resolveNames = async () => {
    const out: { name: string; severity: number }[] = [];
    for (const s of offer.symptoms) {
      const { data } = await supabase.from("community_symptoms").select("name").ilike("name", s.name).is("deleted_at", null).limit(1);
      let name = data?.[0]?.name as string | undefined;
      if (!name) {
        const ins = await supabase.from("community_symptoms").insert({ name: s.name, added_by: userId, submitted_by: userId, status: "approved" }).select("name").maybeSingle();
        name = (ins.data?.name as string | undefined) ?? s.name;
      }
      out.push({ name, severity: typeof s.severity === "number" && s.severity > 0 ? s.severity : 3 });
    }
    return out;
  };

  const log = async (opt: { label: string; days: number }) => {
    setBusy(true); setError(false);
    try {
      const symptoms = await resolveNames();
      const rows = Array.from({ length: Math.max(1, Math.min(7, opt.days)) }, (_, k) => {
        const d = new Date(); d.setDate(d.getDate() - k); if (k > 0) d.setHours(12, 0, 0, 0);
        const cd = offer.cycle_day && offer.cycle_day - k > 0 ? offer.cycle_day - k : null;
        return { user_id: userId, symptoms, notes: null, logged_at: d.toISOString(), cycle_day: cd, cycle_phase: k === 0 ? offer.cycle_phase ?? null : null };
      });
      const { data, error } = await supabase.from("symptom_logs").insert(rows).select("id");
      if (error || !data?.length) throw error;
      const saved: Saved = { label: opt.days === 1 ? "today" : opt.label.toLowerCase(), ids: data.map((r) => r.id) };
      localStorage.setItem(key(messageId), JSON.stringify(saved));
      setState(saved);
      window.dispatchEvent(new CustomEvent("logan:symptoms-changed"));
    } catch (e) {
      console.error("[LogOfferCard] log failed", e); setError(true);
    } finally { setBusy(false); }
  };

  const undo = async () => {
    if (!state) return;
    setBusy(true);
    const { error } = await supabase.from("symptom_logs").delete().in("id", state.ids).eq("user_id", userId);
    setBusy(false);
    if (error) { setError(true); return; }
    localStorage.removeItem(key(messageId)); setState(null);
    window.dispatchEvent(new CustomEvent("logan:symptoms-changed"));
  };

  const names = offer.symptoms.map((s) => s.name.toLowerCase());
  const label = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

  if (state) {
    return (
      <p className="mt-2 text-[13px] text-muted-foreground">
        Logged for {state.label} ·{" "}
        <button type="button" onClick={undo} disabled={busy} className="underline underline-offset-2">Undo</button>
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-[22px] border border-border bg-card px-4 py-3">
      <p className="text-sm font-semibold text-foreground">Log {label}?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {offer.options.map((o) => (
          <button key={o.label} type="button" disabled={busy} onClick={() => log(o)}
            className="rounded-full bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background disabled:opacity-50">{o.label}</button>
        ))}
        <button type="button" disabled={busy} onClick={() => { localStorage.setItem(key(messageId), "dismissed"); setState("dismissed"); }}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground">Not now</button>
      </div>
      {error && <p className="mt-2 text-[13px] text-muted-foreground">That didn't save. Try again.</p>}
    </div>
  );
}
