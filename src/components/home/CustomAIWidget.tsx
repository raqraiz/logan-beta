import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, Quote as QuoteIcon, Settings2 } from "lucide-react";
import type { WidgetFormat, WidgetAccent } from "@/hooks/useWidgetPreferences";

interface CustomAIWidgetProps {
  title: string;
  prompt: string;
  format?: WidgetFormat;
  accent?: WidgetAccent;
  phase: string;
  cycleDay: number;
  cycleLengthDays: number;
  targetUserId?: string;
  lifeStage?: "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant";
  postpartumStartDate?: string;
  postpartumActive?: boolean;
  onEdit?: () => void;
}

const ACCENT_STYLES: Record<WidgetAccent, { border: string; glow: string; bg: string; dot: string; text: string }> = {
  teal:   { border: "border-l-[#15B88C]", glow: "shadow-[0_0_24px_-8px_rgba(21,184,140,0.25)]", bg: "from-[#15B88C]/10 to-transparent", dot: "bg-[#15B88C]", text: "text-[#15B88C]" },
  rose:   { border: "border-l-[#E94560]", glow: "shadow-[0_0_24px_-8px_rgba(233,69,96,0.25)]",  bg: "from-[#E94560]/10 to-transparent", dot: "bg-[#E94560]", text: "text-[#E94560]" },
  amber:  { border: "border-l-[#F0A33C]", glow: "shadow-[0_0_24px_-8px_rgba(240,163,60,0.25)]", bg: "from-[#F0A33C]/10 to-transparent", dot: "bg-[#F0A33C]", text: "text-[#F0A33C]" },
  violet: { border: "border-l-[#9D6BE0]", glow: "shadow-[0_0_24px_-8px_rgba(157,107,224,0.25)]",bg: "from-[#9D6BE0]/10 to-transparent", dot: "bg-[#9D6BE0]", text: "text-[#9D6BE0]" },
  sky:    { border: "border-l-[#4FA8E0]", glow: "shadow-[0_0_24px_-8px_rgba(79,168,224,0.25)]", bg: "from-[#4FA8E0]/10 to-transparent", dot: "bg-[#4FA8E0]", text: "text-[#4FA8E0]" },
};

interface ParsedContent {
  kind: WidgetFormat;
  text?: string;
  items?: string[];
  stat?: { value: string; label?: string };
}

function parseContent(raw: string, format: WidgetFormat): ParsedContent {
  const trimmed = raw.trim();
  // Try JSON first (for stat/checklist/bullets when AI returns structured)
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      if (format === "stat" && typeof data === "object" && data.value !== undefined) {
        return { kind: "stat", stat: { value: String(data.value), label: data.label } };
      }
      if ((format === "bullets" || format === "checklist") && Array.isArray(data)) {
        return { kind: format, items: data.map((s: any) => String(s)).slice(0, 6) };
      }
      if ((format === "bullets" || format === "checklist") && Array.isArray(data.items)) {
        return { kind: format, items: data.items.map((s: any) => String(s)).slice(0, 6) };
      }
    } catch { /* fall through */ }
  }

  if (format === "bullets" || format === "checklist") {
    const items = trimmed
      .split("\n")
      .map(l => l.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    if (items.length) return { kind: format, items };
  }

  if (format === "stat") {
    const m = trimmed.match(/(\d+(?:\.\d+)?\s*[%/]?\d*)/);
    if (m) {
      const value = m[1];
      const label = trimmed.replace(m[0], "").replace(/^[\s—\-:]+/, "").trim();
      return { kind: "stat", stat: { value, label } };
    }
  }

  return { kind: format === "stat" ? "paragraph" : format, text: trimmed };
}

export function CustomAIWidget({
  title,
  prompt,
  format = "paragraph",
  accent = "teal",
  phase,
  cycleDay,
  cycleLengthDays,
  targetUserId,
  lifeStage,
  postpartumStartDate,
  postpartumActive,
  onEdit,
}: CustomAIWidgetProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChecked({});
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-widget", {
        body: { prompt, format, phase, cycleDay, cycleLengthDays, targetUserId, lifeStage, postpartumStartDate, postpartumActive },
      });
      if (fnError) throw fnError;
      setContent(data?.content || "No insight available.");
    } catch (e: any) {
      console.error("Custom widget error:", e);
      setError("Couldn't generate insight right now.");
    } finally {
      setLoading(false);
    }
  }, [prompt, format, phase, cycleDay, cycleLengthDays, targetUserId, lifeStage, postpartumStartDate, postpartumActive]);

  useEffect(() => { generate(); }, [generate]);

  const parsed = useMemo(() => content ? parseContent(content, format) : null, [content, format]);
  const styles = ACCENT_STYLES[accent] || ACCENT_STYLES.teal;

  return (
    <div
      className={`w-full text-left rounded-2xl border border-border/30 border-l-2 ${styles.border}
        bg-card overflow-hidden transition-colors duration-200 ${styles.glow} relative`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${styles.bg} pointer-events-none`} />

      <div className="relative px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className={`w-3 h-3 ${styles.text} opacity-70`} />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors"
                aria-label="Edit widget"
              >
                <Settings2 className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={generate}
              disabled={loading}
              className="text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors disabled:opacity-30"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex gap-1.5 items-center py-3">
            <div className={`h-2 w-2 rounded-full ${styles.dot} opacity-40 animate-pulse`} />
            <div className={`h-2 w-2 rounded-full ${styles.dot} opacity-40 animate-pulse [animation-delay:150ms]`} />
            <div className={`h-2 w-2 rounded-full ${styles.dot} opacity-40 animate-pulse [animation-delay:300ms]`} />
          </div>
        ) : error ? (
          <p className="text-[14px] text-muted-foreground/70 leading-snug">{error}</p>
        ) : parsed?.kind === "stat" && parsed.stat ? (
          <div className="py-1">
            <div className={`text-4xl font-bold ${styles.text} tracking-tight leading-none`}>
              {parsed.stat.value}
            </div>
            {parsed.stat.label && (
              <p className="text-[13px] text-foreground/70 mt-2 leading-snug">{parsed.stat.label}</p>
            )}
          </div>
        ) : parsed?.kind === "bullets" && parsed.items ? (
          <ul className="space-y-1.5">
            {parsed.items.map((item, i) => (
              <li key={i} className="flex gap-2 text-[14px] text-foreground/90 leading-snug">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${styles.dot} shrink-0`} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : parsed?.kind === "checklist" && parsed.items ? (
          <ul className="space-y-2">
            {parsed.items.map((item, i) => {
              const done = !!checked[i];
              return (
                <li key={i}>
                  <button
                    onClick={() => setChecked(c => ({ ...c, [i]: !c[i] }))}
                    className="flex items-start gap-2.5 text-left w-full group"
                  >
                    <span
                      className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                        done ? `${styles.dot} border-transparent` : "border-muted-foreground/40 group-hover:border-foreground/60"
                      }`}
                    >
                      {done && (
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
                          <path d="M2 6l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-[14px] leading-snug ${done ? "text-muted-foreground/60 line-through" : "text-foreground/90"}`}>
                      {item}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : parsed?.kind === "quote" ? (
          <div className="flex gap-3 py-1">
            <QuoteIcon className={`w-5 h-5 ${styles.text} opacity-60 shrink-0`} />
            <p className="text-[15px] text-foreground/90 leading-relaxed italic font-medium">
              {parsed.text}
            </p>
          </div>
        ) : (
          <p className="text-[15px] text-foreground/90 leading-snug font-medium">{parsed?.text}</p>
        )}
      </div>
    </div>
  );
}
