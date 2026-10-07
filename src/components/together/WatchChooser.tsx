import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

const GOOD_DAYS = ["Lots of energy", "Feeling confident", "Clear head", "Sleeping well"];

/** "Choose what to watch": up to 3, saved to participants.watch_symptoms and re-read. */
export function WatchChooser({ userId, open, onOpenChange, watch, logged, onSaved }: {
  userId: string; open: boolean; onOpenChange: (o: boolean) => void; watch: string[]; logged: string[]; onSaved: (w: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(watch);
  const [err, setErr] = useState(false);
  useEffect(() => { if (open) { setDraft(watch); setErr(false); } }, [open, watch]);
  const toggle = (n: string) => setDraft((d) => d.includes(n) ? d.filter((x) => x !== n) : d.length >= 3 ? d : [...d, n]);
  const save = async () => {
    const { error } = await supabase.from("participants").update({ watch_symptoms: draft }).eq("user_id", userId);
    if (error) { setErr(true); return; }
    const { data } = await supabase.from("participants").select("watch_symptoms").eq("user_id", userId).maybeSingle();
    onSaved((data?.watch_symptoms ?? draft) as string[]); onOpenChange(false);
  };
  const options = [...new Set([...watch, ...draft, ...logged, ...GOOD_DAYS])];
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle className="font-heading text-2xl">What should I watch for you?</DrawerTitle></DrawerHeader>
        <div className="px-5 pb-6">
          <p className="mb-3 text-sm text-muted-foreground">Pick up to 3.</p>
          <div className="flex flex-wrap gap-2">
            {options.map((n) => {
              const on = draft.includes(n);
              return (
                <button key={n} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(n)} disabled={!on && draft.length >= 3}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-40 ${on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"}`}>
                  {on ? "★ " : ""}{n}
                </button>
              );
            })}
          </div>
          {err && <p className="mt-3 text-sm text-destructive">That didn't save. Try again.</p>}
          <button type="button" onClick={save} className="mt-5 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background">Save</button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
