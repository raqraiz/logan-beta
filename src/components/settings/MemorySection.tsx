import { useCallback, useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { PATTERNS_CHANGED } from "@/lib/patternCycles";
import { EditMemoryPage, usedForFact } from "@/components/you/EditMemoryPage";
import { toast } from "sonner";

interface Note { id: string; note: string; source: string; created_at: string }
export function MemorySection({ userId, view = "all", refresh = 0, hideEmpty = false }: { userId?: string; view?: "all" | "facts" | "hidden"; refresh?: number; hideEmpty?: boolean }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [edit, setEdit] = useState<Note | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("user_memory_notes").select("id, note, source, created_at").eq("user_id", userId).eq("active", true).order("created_at", { ascending: false });
    setError(!!error); if (!error) setNotes(data ?? []); setLoading(false);
  }, [userId]);
  useEffect(() => { void load(); globalThis.addEventListener(PATTERNS_CHANGED, load); return () => globalThis.removeEventListener(PATTERNS_CHANGED, load); }, [load, refresh]);
  const remove = async (id: string, pattern = false) => {
    if (!userId) return;
    const { error } = await supabase.from("user_memory_notes").delete().eq("id", id).eq("user_id", userId);
    const { data: remaining, error: readError } = await supabase.from("user_memory_notes").select("id").eq("id", id).eq("user_id", userId);
    if (error || readError || remaining?.length) { toast.error("That didn't save. Try again."); return; }
    setNotes((n) => n.filter((x) => x.id !== id)); if (pattern) globalThis.dispatchEvent(new Event(PATTERNS_CHANGED));
  };
  const save = async (text?: string) => {
    const value = (text ?? draft).trim();
    if (!edit || !userId || !value) return false;
    setBusy(true);
    const { error } = await supabase.from("user_memory_notes").update({ note: value }).eq("id", edit.id).eq("user_id", userId);
    const { data, error: readError } = await supabase.from("user_memory_notes").select("note").eq("id", edit.id).eq("user_id", userId).maybeSingle();
    setBusy(false);
    if (error || readError || data?.note !== value) { toast.error("That didn't save. Try again."); return false; }
    setEdit(null); await load(); globalThis.dispatchEvent(new Event(PATTERNS_CHANGED)); return true;
  };
  // Forget = delete + an inactive "forgotten" tombstone (never read by AI prompts) so the fact is not re-learned.
  const forget = async (n: Note) => {
    if (!userId) return false;
    const tomb = await supabase.from("user_memory_notes").insert({ user_id: userId, note: n.note, source: "forgotten", active: false });
    if (tomb.error) { toast.error("That didn't save. Try again."); return false; }
    const before = notes.length; await remove(n.id, true);
    const { data } = await supabase.from("user_memory_notes").select("id").eq("id", n.id);
    if (data?.length) return false;
    void before; setEdit(null); toast("Forgotten."); return true;
  };
  const hidden = notes.filter((n) => n.source === "pattern_hidden");
  const rest = notes.filter((n) => n.source !== "pattern_hidden");
  const source = (n: Note) => n.source === "onboarding" ? "You told me when we met" : `You told me in chat on ${new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  return <div className="space-y-5" data-private>
    {loading ? <p className="text-sm text-muted-foreground" role="status">Gathering what you've shared.</p> : error ? <p className="text-sm text-muted-foreground">I couldn't load your memories. <Button variant="link" onClick={load}>Try again</Button></p> : <>
      {view !== "hidden" && <section>
        <h2 className="mb-3 font-sans text-[13px] font-semibold text-muted-foreground">{view === "facts" ? "Facts you told me" : "What Logan remembers"}</h2>
        <div className="overflow-hidden rounded-[22px] bg-card">
          {rest.length === 0 ? !hideEmpty && <p className="p-5 text-sm text-muted-foreground">Nothing yet. As we talk, what I learn about you shows up here.</p> : rest.map((n) => <div key={n.id} className="flex items-center border-b border-border last:border-0">
            <Button variant="ghost" className="h-auto flex-1 justify-between whitespace-normal rounded-none px-5 py-4 text-left" onClick={() => { setEdit(n); setDraft(n.note); }}><span className="min-w-0 text-sm text-foreground">{n.note}<span className="mt-1 block text-xs font-normal text-muted-foreground">{source(n)}</span></span><ChevronRight /></Button>
            {view === "all" && <Button variant="ghost" size="icon" aria-label="Delete this note" onClick={() => remove(n.id)}><X /></Button>}
          </div>)}
        </div>
      </section>}
      {view !== "facts" && <section><h2 className="mb-3 font-sans text-[13px] font-semibold text-muted-foreground">Hidden patterns</h2><div className="rounded-[22px] bg-card">
        {hidden.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nothing hidden. You're in charge of what stays.</p> : hidden.map((n) => <div key={n.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0"><span className="text-sm">{n.note.match(/^(.+?) isn't a pattern for you/)?.[1] ?? n.note}</span><Button variant="link" className="symptom-watch shrink-0 px-0 underline" onClick={() => remove(n.id, true)}>Bring back</Button></div>)}
      </div></section>}
    </>}
    {edit && <EditMemoryPage value={edit.note} source={source(edit)} usedFor={usedForFact("", edit.note)} onClose={() => setEdit(null)} onSave={async (t) => { setDraft(t); return save(t); }} onForget={() => forget(edit)} />}
  </div>;
}
