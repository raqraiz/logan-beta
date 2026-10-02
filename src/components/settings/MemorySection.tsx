import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface Note { id: string; note: string; source: string }

/** What Logan remembers about her (corrections and confirmed patterns). She can delete any note. */
export function MemorySection({ userId }: { userId?: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_memory_notes").select("id, note, source").eq("user_id", userId).eq("active", true)
      .order("created_at", { ascending: false }).then(({ data }) => setNotes((data ?? []) as Note[]));
  }, [userId]);
  const remove = async (id: string) => {
    const { error } = await supabase.from("user_memory_notes").delete().eq("id", id);
    if (!error) setNotes((n) => n.filter((x) => x.id !== id));
  };
  return (
    <div className="border-t border-border/50 pt-4" data-private>
      <Label className="text-sm font-medium mb-2 block">What Logan remembers</Label>
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing yet. When you confirm or correct an insight, it shows up here.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
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
  );
}
