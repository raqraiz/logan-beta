import { useEffect, useRef, useState } from "react";
import { logInsightAction, setPendingCorrection, CORRECTION_PREFIX } from "@/lib/insightFeedback";
import { PREFILL_CHAT_EVENT } from "@/lib/partnerHeadsupClient";
import { supabase } from "@/integrations/supabase/client";

interface Props { userId: string; messageId: string; insightType?: string | null }

/** Records "shown" when the opener insight scrolls into view, and offers "That's right" / "Not quite". */
export function InsightConfirm({ userId, messageId, insightType }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `logan.insightAnswer.${messageId}`;
  const [answer, setAnswer] = useState<string | null>(() => localStorage.getItem(key));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        void logInsightAction(userId, messageId, "shown", insightType);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [userId, messageId, insightType]);

  const [saving, setSaving] = useState(false);
  const choose = async (a: "confirmed" | "not_confirmed") => {
    void logInsightAction(userId, messageId, a, insightType);
    if (a === "not_confirmed") {
      setAnswer(a);
      localStorage.setItem(key, a);
      setPendingCorrection(messageId, insightType);
      globalThis.dispatchEvent(new CustomEvent(PREFILL_CHAT_EVENT, { detail: CORRECTION_PREFIX }));
      return;
    }
    setSaving(true);
    let saved = false;
    try {
      const { data, error } = await supabase.functions.invoke("confirm-insight-memory", { body: { message_id: messageId } });
      saved = !error && data?.saved === true;
      if (!saved) console.error("[insight-confirm] note not saved", error);
    } catch (e) {
      console.error("[insight-confirm] note not saved", e);
    }
    const result = saved ? "confirmed" : "confirmed_unsaved";
    setSaving(false);
    setAnswer(result);
    localStorage.setItem(key, result);
  };

  const btn = "text-[11px] font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline";
  const reply = answer === "confirmed" ? "Got it. I'll remember that."
    : answer === "confirmed_unsaved" ? "Thanks for confirming."
    : "Tell me what's different and I'll adjust.";
  return (
    <div ref={ref} className="mt-1.5 flex items-center gap-3 text-[11px] font-normal text-muted-foreground [font-family:'Quicksand',system-ui,sans-serif]">
      {answer ? (
        <span>{reply}</span>
      ) : saving ? (
        <span>Sound like you?</span>
      ) : (
        <>
          <span>Sound like you?</span>
          <button type="button" data-track="insight.confirm" onClick={() => choose("confirmed")} className={btn}>That's right</button>
          <button type="button" data-track="insight.not_quite" onClick={() => choose("not_confirmed")} className={btn}>Not quite</button>
        </>
      )}
    </div>
  );
}
