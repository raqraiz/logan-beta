import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  value: string; source: string; usedFor: string[];
  onSave: (text: string) => Promise<boolean>; onForget: () => Promise<boolean>; onClose: () => void;
}

/** Where Logan uses a fact, in plain words. Keyed by profile field, else guessed from the note text. */
export function usedForFact(key: string, text: string): string[] {
  const t = text.toLowerCase();
  const base = ["Your chats with Logan"];
  if (key === "age") return ["Cycle estimates", "Your doctor summary", ...base];
  if (key === "anchor_symptom" || key === "typical_symptoms") return ["Your patterns", "Daily tips", "Your doctor summary"];
  if (key === "goals") return ["Daily tips", ...base];
  if (/bleed|period|iud|cycle/.test(t)) return ["Why you rarely bleed", "Cycle estimates", "Your doctor summary"].filter((x, i) => i > 0 || /rarely|iud|light/.test(t));
  if (/usually comes|days|pattern/.test(t)) return ["Your patterns", "Daily tips"];
  return [...base, "Daily tips"];
}

export function EditMemoryPage({ value, source, usedFor, onSave, onForget, onClose }: Props) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<boolean>) => { setBusy(true); const ok = await fn(); setBusy(false); if (ok) onClose(); };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label="Edit what I remember" data-private>
    <div className="mx-auto max-w-lg px-5 pt-5 pb-[calc(120px+env(safe-area-inset-bottom))]">
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-full shadow-none" aria-label="Back" onClick={onClose}><ArrowLeft /></Button>
      <h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.1] text-foreground">Edit what I remember</h1>
      <div className="mt-6 rounded-[22px] bg-card p-5">
        <p className="mb-2 text-[13px] font-semibold text-muted-foreground">I remember</p>
        <Input aria-label="What I remember" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <p className="mt-2 text-xs text-[#6E675F] dark:text-muted-foreground">{source}</p>
      </div>
      <h2 className="mb-3 mt-6 text-[13px] font-semibold text-muted-foreground">Used for</h2>
      <div className="overflow-hidden rounded-[22px] bg-card">{usedFor.map((u) => <p key={u} className="border-b border-border px-5 py-4 text-sm text-foreground last:border-0">{u}</p>)}</div>
      <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#22C3CE]" aria-hidden />Forgotten means gone. It won't shape any answer again.</p>
      <div className="mt-8 flex flex-col gap-3">
        <Button className="h-12 rounded-full bg-foreground text-background hover:bg-foreground/90" disabled={busy || !draft.trim() || draft.trim() === value} onClick={() => run(() => onSave(draft.trim()))}>Save</Button>
        <Button variant="outline" className="h-12 rounded-full bg-card" disabled={busy} onClick={() => run(onForget)}>That's wrong, forget it</Button>
      </div>
    </div>
  </div>;
}
