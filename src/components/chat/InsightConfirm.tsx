import { useEffect, useRef, useState } from "react";
import { logInsightAction, setPendingCorrection, CORRECTION_PREFIX } from "@/lib/insightFeedback";
import { PREFILL_CHAT_EVENT } from "@/lib/partnerHeadsupClient";

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

  const choose = (a: "confirmed" | "not_confirmed") => {
    setAnswer(a);
    localStorage.setItem(key, a);
    void logInsightAction(userId, messageId, a, insightType);
    if (a === "not_confirmed") {
      setPendingCorrection(messageId, insightType);
      globalThis.dispatchEvent(new CustomEvent(PREFILL_CHAT_EVENT, { detail: CORRECTION_PREFIX }));
    }
  };

  return (
    <div ref={ref} className="mt-2 flex items-center gap-2 text-xs">
      {answer ? (
        <span className="text-muted-foreground">{answer === "confirmed" ? "Thanks, noted." : "Tell me what's different and I'll adjust."}</span>
      ) : (
        <>
          <span className="text-muted-foreground">Sound like you?</span>
          <button type="button" data-track="insight.confirm" onClick={() => choose("confirmed")} className="rounded-full border border-border/60 px-3 py-1 text-foreground hover:bg-muted/50">That's right</button>
          <button type="button" data-track="insight.not_quite" onClick={() => choose("not_confirmed")} className="rounded-full border border-border/60 px-3 py-1 text-foreground hover:bg-muted/50">Not quite</button>
        </>
      )}
    </div>
  );
}
