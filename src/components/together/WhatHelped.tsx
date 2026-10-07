import { Fragment, useEffect, useState } from "react";
import { ArrowLeft, Check, Heart, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { trackTogether } from "@/lib/together";
import {
  TIP_MAX, TIPS_CHANGED, hideTipAuthor, loadTips, logansNotes, reportTip, sortTips, submitTip, toggleVote,
  type Tip, type TipReportReason, type TipSort,
} from "@/lib/tips";

const SORTS: { key: TipSort; label: string }[] = [
  { key: "helpful", label: "Most helpful" },
  { key: "like_me", label: "Women like me" },
  { key: "newest", label: "Newest" },
];
const REASONS: { key: TipReportReason; label: string }[] = [
  { key: "unsafe", label: "Unsafe or harmful" },
  { key: "off_topic", label: "Not about this symptom" },
  { key: "advertising", label: "Advertising" },
  { key: "other", label: "Something else" },
];

function Shell({ label, onBack, children }: { label: string; onBack: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    globalThis.addEventListener("keydown", h);
    return () => globalThis.removeEventListener("keydown", h);
  }, [onBack]);
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label={label}>
    <div className="mx-auto max-w-lg px-5 pt-5 pb-[calc(48px+env(safe-area-inset-bottom))]">
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-full shadow-none" aria-label="Back" onClick={onBack}><ArrowLeft /></Button>
      {children}
    </div>
  </div>;
}

interface PageProps { symptom: string; checkFirst?: boolean; canContribute?: boolean; joined: boolean; onJoin: () => void; onBack: () => void; onShare: () => void }

export function WhatHelpedPage({ symptom, checkFirst = false, canContribute = true, joined, onJoin, onBack, onShare }: PageProps) {
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<TipSort>("helpful");
  const [reporting, setReporting] = useState<Tip | null>(null);
  const load = () => { setError(false); loadTips(symptom).then(setTips).catch(() => setError(true)); };
  useEffect(load, [symptom]);
  const likeMeEmpty = !!tips && !tips.some((t) => t.same_stage);
  const shown = tips ? sortTips(tips, sort) : [];
  const notes = tips ? logansNotes(tips) : [];

  const vote = async (t: Tip) => {
    if (!joined) { onJoin(); return; }
    const before = tips;
    setTips((list) => list?.map((x) => x.id === t.id ? { ...x, helped_by_me: !x.helped_by_me, helped: x.helped + (x.helped_by_me ? -1 : 1) } : x) ?? null);
    try { const on = await toggleVote(t.id); if (on) trackTogether("tip_helped"); globalThis.dispatchEvent(new Event(TIPS_CHANGED)); }
    catch { setTips(before); toast.error("That didn't save. Try again."); }
  };
  const hideAuthor = async (t: Tip) => {
    try { await hideTipAuthor(t.id); load(); globalThis.dispatchEvent(new Event(TIPS_CHANGED)); toast("You won't see tips from this person. Undo in Settings, Privacy."); }
    catch { toast.error("That didn't save. Try again."); }
  };
  const report = async (t: Tip, reason: TipReportReason) => {
    setReporting(null);
    setTips((list) => list?.filter((x) => x.id !== t.id) ?? null);
    try { await reportTip(t.id, reason); trackTogether("tip_reported"); globalThis.dispatchEvent(new Event(TIPS_CHANGED)); toast("Thanks. I've hidden it for you and a person will look at it."); }
    catch { load(); toast.error("That report didn't send. Try again."); }
  };

  return <Shell label={`What helped with ${symptom.toLowerCase()}`} onBack={onBack}>
    <h1 className="mt-6 font-display text-[36px] font-semibold leading-[1.1] text-foreground">What helped with {symptom.toLowerCase()}</h1>
    <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Sort tips">
      {SORTS.map((s) => {
        const on = sort === s.key; const off = s.key === "like_me" && likeMeEmpty;
        return <button key={s.key} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => setSort(s.key)}
          className={cn("relative h-9 rounded-full border px-4 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
            on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground", off && "opacity-40")}>
          {on && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}{s.label}
        </button>;
      })}
    </div>
    {sort === "like_me" && likeMeEmpty && <p className="mt-2 text-xs text-muted-foreground">No tips from women in your stage yet.</p>}
    {checkFirst && <div role="note" className="safety-callout mt-5 flex gap-2 rounded-2xl p-[14px] text-sm font-medium text-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{CHECK_FIRST_TIPS_NOTE}</span>
    </div>}

    <div className="mt-5 space-y-3">
      {error ? <div className="rounded-[22px] bg-card p-5 text-sm text-muted-foreground">Tips couldn't load. <Button variant="link" className="h-auto p-0 text-foreground underline" onClick={load}>Try again</Button></div>
        : !tips ? [0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-[22px] bg-muted" />)
        : !shown.length ? <div className="rounded-[22px] bg-card p-5 text-sm text-muted-foreground">No tips yet. Be the first to share what helped you.</div>
        : shown.map((t, i) => <Fragment key={t.id}>
          <article className="rounded-[22px] bg-card p-5">
            <div className="flex items-start gap-2">
              <p className="flex-1 font-sans text-base leading-relaxed text-foreground">“{t.text}”</p>
              {!t.mine && <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-11 w-11 shrink-0 rounded-full text-muted-foreground" aria-label="More options"><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setReporting(t)}>Report</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void hideAuthor(t)}>Hide tips from this person</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t.label}</p>
            {!t.mine && canContribute && <Button variant="outline" aria-pressed={t.helped_by_me} onClick={() => void vote(t)}
              className={cn("mt-3 h-11 rounded-full px-4 text-sm font-semibold shadow-none", t.helped_by_me ? "border-foreground bg-foreground text-background hover:bg-foreground hover:text-background" : "text-foreground")}>
              <Heart className={cn("h-4 w-4", t.helped_by_me && "fill-current")} aria-hidden="true" /> Helped me too · {t.helped}
            </Button>}
          </article>
          {(i + 1) % 3 === 0 && notes[Math.floor(i / 3)] && <aside className="rounded-[22px] bg-muted p-5">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground">LOGAN'S NOTE</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{notes[Math.floor(i / 3)]}</p>
          </aside>}
        </Fragment>)}
    </div>

    {!canContribute ? <p className="mt-6 text-sm leading-relaxed text-muted-foreground">Sharing and voting open once you've logged {symptom.toLowerCase()} in two different cycles.</p> : <Button onClick={joined ? onShare : onJoin} className="mt-6 h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90">
      {joined ? "Share what helped you" : "Count me in to share"}
    </Button>}

    <Drawer open={!!reporting} onOpenChange={(v) => !v && setReporting(null)}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle className="font-display text-2xl">Why are you reporting this?</DrawerTitle></DrawerHeader>
        <div className="space-y-2 px-5 pb-6">
          {REASONS.map((r) => <Button key={r.key} variant="outline" className="h-11 w-full rounded-full" onClick={() => reporting && void report(reporting, r.key)}>{r.label}</Button>)}
        </div>
      </DrawerContent>
    </Drawer>
  </Shell>;
}

interface ShareProps { symptom: string; label: string; onBack: () => void; onDone: () => void }

export function ShareTipPage({ symptom, label, onBack, onDone }: ShareProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<{ id?: string; reason: string } | null>(null);
  const [sent, setSent] = useState<"approved" | "pending" | "rejected" | null>(null);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await submitTip(symptom, text.trim(), rejected?.id);
      if (r.status === "rejected") { setRejected({ id: r.id ?? rejected?.id, reason: r.reason ?? "This one can't be shared as it is." }); setSent("rejected"); return; }
      setRejected(null);
      trackTogether("tip_shared");
      globalThis.dispatchEvent(new Event(TIPS_CHANGED));
      setSent(r.status);
    } catch { toast.error("That didn't send. Try again."); }
    finally { setBusy(false); }
  };

  if (sent === "rejected" && rejected) return <Shell label="Tip not shared" onBack={() => setSent(null)}>
    <h1 className="mt-6 font-display text-[36px] font-semibold leading-[1.1] text-foreground">Almost there</h1>
    <p className="mt-3 text-base text-foreground">{rejected.reason}</p>
    <Button onClick={() => setSent(null)} className="mt-8 h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90">Edit and resend</Button>
    <Button variant="link" onClick={onDone} className="mt-2 w-full text-sm text-muted-foreground underline">Cancel</Button>
  </Shell>;

  if (sent === "approved" || sent === "pending") return <Shell label="Tip sent" onBack={onDone}>
    <h1 className="mt-6 font-display text-[36px] font-semibold leading-[1.1] text-foreground">Thank you</h1>
    <p className="mt-3 text-base text-foreground">{sent === "approved" ? "It's live. Thank you for helping." : "I'll check it first, then share it with other women."}</p>
    <Button onClick={onDone} className="mt-8 h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90">Done</Button>
  </Shell>;

  return <Shell label="What helped you?" onBack={onBack}>
    <h1 className="mt-6 font-display text-[36px] font-semibold leading-[1.1] text-foreground">What helped you?</h1>
    <p className="mt-2 text-base font-light text-muted-foreground">Your words could be what another woman needs tonight.</p>
    <span className="mt-4 inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">For {symptom.toLowerCase()}</span>
    <div className="mt-4 rounded-[22px] bg-card p-4">
      <Textarea value={text} maxLength={TIP_MAX} onChange={(e) => { setText(e.target.value.slice(0, TIP_MAX)); }} rows={4}
        aria-label="What helped you" placeholder="What helped, in your own words" className="resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0" />
      <p className="mt-2 text-right text-xs text-muted-foreground" aria-live="polite">{text.length}/{TIP_MAX}</p>
    </div>
    {rejected && <div role="alert" className="safety-callout mt-3 rounded-2xl p-[14px] text-sm">{rejected.reason}</div>}
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Shared with no name, photo or age. Others see only “{label}”.</p>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Logan checks every tip first and removes names, links and medicine doses.</p>
    <Button disabled={!text.trim() || busy} onClick={() => void send()} className="mt-6 h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90">
      {busy ? "Checking…" : rejected ? "Edit and resend" : "Share anonymously"}
    </Button>
    <Button variant="link" onClick={onBack} className="mt-2 w-full text-sm text-muted-foreground underline">Cancel</Button>
  </Shell>;
}
