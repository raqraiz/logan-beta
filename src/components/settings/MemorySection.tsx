import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PATTERNS_CHANGED } from "@/lib/patternCycles";

interface Note { id: string; note: string; source: string }

/** What Logan remembers about her (corrections and confirmed patterns), plus patterns she hid. She can delete or restore any. */
export function MemorySection({ userId }: { userId?: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_memory_notes").select("id, note, source").eq("user_id", userId).eq("active", true)
      .order("created_at", { ascending: false }).then(({ data }) => setNotes((data ?? []) as Note[]));
  }, [userId]);
  const remove = async (id: string, pattern = false) => {
    const { error } = await supabase.from("user_memory_notes").delete().eq("id", id);
    if (!error) { setNotes((n) => n.filter((x) => x.id !== id)); if (pattern) globalThis.dispatchEvent(new Event(PATTERNS_CHANGED)); }
  };
  const hidden = notes.filter((n) => n.source === "pattern_hidden");
  const rest = notes.filter((n) => n.source !== "pattern_hidden");
  return (
    <div className="space-y-4" data-private>
      <div className="border-t border-border/50 pt-4">
        <Label className="text-sm font-medium mb-2 block">What Logan remembers</Label>
        {rest.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing yet. When you confirm or correct an insight, it shows up here.</p>
        ) : (
          <ul className="space-y-2">
            {rest.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2 text-sm text-foreground">
                <span>
                  {n.note}
                  <span className="block text-[11px] text-muted-foreground">
                    {n.source === "insight_confirmed" ? "You confirmed this" : n.source === "insight_correction" ? "You corrected this" : "You told Logan"}
                  </span>
                </span>
                <button type="button" aria-label="Delete this note" onClick={() => remove(n.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border/50 pt-4">
        <Label className="text-sm font-medium mb-2 block">Hidden patterns</Label>
        {hidden.length === 0 ? (
          <p className="text-xs text-muted-foreground">None. Patterns you hide show up here.</p>
        ) : (
          <ul className="space-y-2">
            {hidden.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2 text-sm text-foreground">
                <span>{n.note.match(/^(.+?) isn't a pattern for you/)?.[1] ?? n.note}</span>
                <button type="button" onClick={() => remove(n.id, true)} className="shrink-0 text-sm font-semibold text-primary underline underline-offset-2">Bring back</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
