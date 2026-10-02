import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  HEADSUP_HELP_OPTIONS,
  HEADSUP_FOOTER,
  buildExampleMessage,
  hasCompletedCycle,
  nextHarderWindow,
  toE164,
  type HeadsupRelationship,
  type HeadsupTiming,
} from "@/lib/partnerHeadsup";

const chip = (active: boolean) =>
  `min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors ${
    active
      ? "headsup-chip-active"
      : "border-border/60 bg-card/60 text-foreground hover:bg-card"
  }`;

const primaryBtn =
  "headsup-primary min-h-[44px] w-full rounded-full px-5 text-sm font-medium transition-opacity disabled:opacity-40";

interface Props {
  userId: string;
  onClose?: () => void;
}

/** In-chat setup for partner heads-ups: chips, not a form. */
export function PartnerHeadsupSetup({ userId, onClose }: Props) {
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [proceedAnyway, setProceedAnyway] = useState(false);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<HeadsupRelationship | null>(null);
  const [helps, setHelps] = useState<string[]>([]);
  const [customHelp, setCustomHelp] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [timing, setTiming] = useState<HeadsupTiming | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    hasCompletedCycle(userId).then(setEligible);
    supabase
      .from("partner_headsup_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setName(data.partner_name ?? "");
        setPhone(data.whatsapp_number ?? "");
        setRelationship((data.relationship as HeadsupRelationship) ?? null);
        setHelps(data.helps ?? []);
        setTiming((data.timing as HeadsupTiming) ?? null);
      });
  }, [userId]);

  const displayName = name.trim() || "them";

  const toggleHelp = (v: string) =>
    setHelps((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const confirmWho = () => {
    if (phone.trim()) {
      const e164 = toE164(phone);
      if (!e164) {
        setPhoneError("Add the country code, for example +44 7700 900123.");
        return;
      }
      setPhone(e164);
    }
    setPhoneError(null);
    setStep(2);
  };

  const addCustom = () => {
    const t = customHelp.trim();
    if (!t) return;
    setHelps((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setCustomHelp("");
    setShowCustom(false);
  };

  if (eligible === null) return null;

  if (!eligible && !proceedAnyway) {
    return (
      <div className="headsup-surface headsup-enter mt-2 rounded-[20px] border border-border/50 p-4 space-y-3">
        <p className="text-sm">
          I'll need one full cycle to know when your harder days land. Want me to set it up now and have the first one ready then?
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={chip(false)} onClick={() => setProceedAnyway(true)}>Set it up now</button>
          <button className={chip(false)} onClick={onClose}>Not now</button>
        </div>
      </div>
    );
  }

  if (done) return null;

  return (
    <div className="headsup-surface headsup-enter mt-2 rounded-[20px] border border-border/50 p-4 space-y-5">
      {/* Step 1: who */}
      <div className="space-y-3">
        <p className="text-sm">Who should it go to?</p>
        {step === 1 ? (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Their name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                className="w-full min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]"
              />
            </label>
            {name.trim() && (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{name.trim()}'s WhatsApp number (optional)</span>
                <input
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }}
                  inputMode="tel"
                  placeholder="+44 7700 900123"
                  className="w-full min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]"
                />
                <span className="block text-xs font-light text-muted-foreground">
                  So I can open your chat with {name.trim()} directly.
                </span>
                {phoneError && <span className="block text-xs text-destructive">{phoneError}</span>}
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              {(["partner", "family", "friend"] as HeadsupRelationship[]).map((r) => (
                <button key={r} className={chip(relationship === r)} onClick={() => setRelationship(r)}>
                  {r === "partner" ? "Partner" : r === "family" ? "Family" : "Friend"}
                </button>
              ))}
            </div>
            <button className={primaryBtn} disabled={!name.trim() || !relationship} onClick={confirmWho}>
              Next
            </button>
          </>
        ) : (
          <button className="text-sm font-medium headsup-accent-text" onClick={() => setStep(1)}>
            {name.trim()} · {relationship === "partner" ? "Partner" : relationship === "family" ? "Family" : "Friend"}
          </button>
        )}
      </div>

      {/* Step 2: helps */}
      {step >= 2 && (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <p className="text-sm">On those days, what actually helps? Pick any, and I'll put them in your words.</p>
          <div className="flex flex-wrap gap-2">
            {HEADSUP_HELP_OPTIONS.map((o) => (
              <button key={o.value} className={chip(helps.includes(o.value))} onClick={() => toggleHelp(o.value)}>
                {o.label}
              </button>
            ))}
            {helps.filter((h) => !HEADSUP_HELP_OPTIONS.some((o) => o.value === h)).map((h) => (
              <button key={h} className={chip(true)} onClick={() => toggleHelp(h)}>{h}</button>
            ))}
            <button className={chip(showCustom)} onClick={() => setShowCustom((s) => !s)}>Add your own</button>
          </div>
          {showCustom && (
            <div className="flex gap-2">
              <input
                value={customHelp}
                onChange={(e) => setCustomHelp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustom()}
                maxLength={60}
                autoFocus
                className="flex-1 min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none"
              />
              <button className={chip(false)} onClick={addCustom}>Add</button>
            </div>
          )}
          {step === 2 && (
            <button className={primaryBtn} disabled={helps.length === 0} onClick={() => setStep(3)}>Next</button>
          )}
        </div>
      )}

      {/* Step 3: timing */}
      {step >= 3 && (
        <div className="space-y-3 border-t border-border/40 pt-4">
          <p className="text-sm">When should I have it ready for you?</p>
          <div className="flex flex-wrap gap-2">
            <button className={chip(timing === "evening_before")} onClick={() => setTiming("evening_before")}>The evening before</button>
            <button className={chip(timing === "morning_of")} onClick={() => setTiming("morning_of")}>That morning</button>
          </div>
          <button className={primaryBtn} disabled={!timing} onClick={() => setReviewOpen(true)}>
            See what {displayName} would get
          </button>
        </div>
      )}

      {timing && relationship && (
        <HeadsupReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          userId={userId}
          name={displayName}
          relationship={relationship}
          phone={phone.trim() ? toE164(phone) : null}
          helps={helps}
          timing={timing}
          onEnabled={() => { setReviewOpen(false); setDone(true); onClose?.(); }}
        />
      )}
    </div>
  );
}

interface ReviewProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  name: string;
  relationship: HeadsupRelationship;
  phone: string | null;
  helps: string[];
  timing: HeadsupTiming;
  onEnabled: () => void;
}

function HeadsupReviewDialog({ open, onOpenChange, userId, name, relationship, phone, helps, timing, onEnabled }: ReviewProps) {
  const [includeDates, setIncludeDates] = useState(true);
  const [includeMood, setIncludeMood] = useState(true);
  const [includeHelps, setIncludeHelps] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [saving, setSaving] = useState(false);
  const [harderWindow, setWindow] = useState<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("participants")
      .select("last_period_start, cycle_length_days")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setWindow(nextHarderWindow(data?.last_period_start, data?.cycle_length_days)));
  }, [open, userId]);

  const example = useMemo(
    () => buildExampleMessage({ name, relationship, helps, includeDates, includeMood, includeHelps, window: harderWindow }),
    [name, relationship, helps, includeDates, includeMood, includeHelps, harderWindow],
  );

  const turnOn = async () => {
    setSaving(true);
    const { error } = await supabase.from("partner_headsup_settings").upsert(
      {
        user_id: userId,
        partner_name: name,
        relationship,
        whatsapp_number: phone,
        helps,
        timing,
        include_dates: includeDates,
        include_mood: includeMood,
        include_helps: includeHelps,
        include_footer: includeFooter,
        enabled: true,
        paused_until: null,
        consent_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      setSaving(false);
      toast({ title: "Couldn't turn on heads-ups", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: `All set. I'll have the first one ready the ${timing === "evening_before" ? "evening before" : "morning of"} your next harder stretch.`,
      message_type: "text",
      metadata: { partner_headsup: "enabled" },
    });
    setSaving(false);
    globalThis.dispatchEvent(new CustomEvent("logan:headsup-updated"));
    onEnabled();
  };

  const rows: [string, boolean, (v: boolean) => void][] = [
    ["Rough dates", includeDates, setIncludeDates],
    ["Energy and mood, in general terms", includeMood, setIncludeMood],
    ["What helps", includeHelps, setIncludeHelps],
    ['The "Sent with Logan" line', includeFooter, setIncludeFooter],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="headsup-surface sm:max-w-md max-h-[92vh] overflow-y-auto rounded-[20px]">
        <DialogTitle className="headsup-headline text-[32px] leading-tight">Here's what {name} would get</DialogTitle>
        <DialogDescription className="sr-only">Review the example message before turning on heads-ups.</DialogDescription>

        <div className="headsup-enter rounded-[20px] border border-border/50 bg-card/70 p-4 space-y-2">
          <div className="text-[11px] font-medium tracking-[0.12em] headsup-gradient-text">EXAMPLE MESSAGE</div>
          <p className="text-sm leading-relaxed">{example}</p>
          {includeFooter && <p className="text-xs font-light text-muted-foreground">{HEADSUP_FOOTER}</p>}
        </div>

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Included</div>
          {rows.map(([label, value, set]) => (
            <label key={label} className="flex min-h-[44px] items-center justify-between border-b border-border/40 text-sm">
              <span>{label}</span>
              <Switch checked={value} onCheckedChange={set} />
            </label>
          ))}
        </div>

        <div className="rounded-[20px] bg-muted/60 p-4 space-y-1">
          <div className="text-xs font-medium">Never included</div>
          <p className="text-xs text-muted-foreground">
            Symptom details, bleeding, fertility, or anything you've said to Logan in chat.
          </p>
        </div>

        <p className="text-xs font-light text-muted-foreground">
          Logan never contacts {name}. {name}'s number stays on your account and is only used to open your chat. You send each message yourself, from your own WhatsApp.
        </p>

        <div className="space-y-2">
          <button className={primaryBtn} disabled={saving} onClick={turnOn}>Turn on heads-ups</button>
          <p className="text-center text-xs font-light text-muted-foreground">You can pause or turn this off any time.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
