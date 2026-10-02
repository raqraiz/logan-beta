import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { generateDraft } from "@/lib/partnerHeadsupClient";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  text: string;
  includeFooter: boolean;
  userLanguage: "en" | "he" | "es";
  genBase: Record<string, unknown>;
  onDone: (text: string, includeFooter: boolean) => void;
}

const chip = "min-h-[40px] px-4 rounded-full border border-border/60 bg-card/60 text-sm font-medium hover:bg-card transition-colors disabled:opacity-40";

export function HeadsupEditSheet({ open, onOpenChange, name, text, includeFooter, userLanguage, genBase, onDone }: Props) {
  const [draft, setDraft] = useState(text);
  const [footer, setFooter] = useState(includeFooter);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setDraft(text); setFooter(includeFooter); setErr(null); } }, [open, text, includeFooter]);

  const langChip: { label: string; lang: "en" | "he" | "es" } =
    userLanguage === "he" || userLanguage === "es" ? { label: "Write it in English", lang: "en" }
    : { label: "Write it in Hebrew", lang: "he" };

  const run = async (key: string, extra: Record<string, unknown>) => {
    setBusy(key); setErr(null);
    try {
      const r = await generateDraft({ ...genBase, current_text: draft, ...extra });
      setDraft(r.text);
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="headsup-surface max-h-[92vh]">
        <div className="mx-auto w-full max-w-md px-4 pb-6 pt-2 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <button className="min-h-[44px] text-sm text-muted-foreground" onClick={() => onOpenChange(false)}>Cancel</button>
            <DrawerTitle className="text-base font-medium">Edit message</DrawerTitle>
            <button className="min-h-[44px] text-sm font-medium headsup-accent-text" onClick={() => onDone(draft.trim(), footer)} disabled={!draft.trim()}>Done</button>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Message to {name}</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              dir="auto"
              className="w-full rounded-[16px] border border-border/60 bg-background/60 p-3 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]"
            />
          </label>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Or ask Logan to adjust it</div>
            <div className="flex flex-wrap gap-2">
              {([["shorter", "Shorter"], ["warmer", "Warmer"], ["lighter", "Lighter"], ["funny", "A bit funny"]] as const).map(([k, l]) => (
                <button key={k} className={chip} disabled={!!busy} onClick={() => run(k, { adjust: k })}>
                  {busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : l}
                </button>
              ))}
              <button className={chip} disabled={!!busy} onClick={() => run("lang", { language: langChip.lang })}>
                {busy === "lang" ? <Loader2 className="h-4 w-4 animate-spin" /> : langChip.label}
              </button>
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
          <div className="flex items-center justify-between rounded-[16px] border border-border/50 p-3">
            <span className="text-sm">Include "Sent with Logan"</span>
            <Switch checked={footer} onCheckedChange={setFooter} />
          </div>
          <p className="text-xs text-muted-foreground">Your edits teach Logan how you like to say things. Next time's draft will sound more like you.</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
