import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface GlossaryTerm {
  term: string;
  aliases: string[];
  short: string;
  detail: string;
}

export const CYCLE_GLOSSARY: GlossaryTerm[] = [
  {
    term: "Luteal phase",
    aliases: ["luteal"],
    short: "The ~2 weeks between ovulation and your next period.",
    detail:
      "Progesterone rises then drops, which can cause PMS-like symptoms: fatigue, mood swings, bloating, and cravings. Energy and focus tend to dip compared to earlier in your cycle.",
  },
  {
    term: "Follicular phase",
    aliases: ["follicular"],
    short: "The phase right after your period ends, leading up to ovulation.",
    detail:
      "Estrogen gradually rises, boosting energy, mood, and mental clarity. Many people feel their most creative and motivated during this window.",
  },
  {
    term: "Ovulation",
    aliases: ["ovulatory", "ovulating", "ovulate"],
    short: "When an egg is released — usually around the middle of your cycle.",
    detail:
      "Estrogen peaks and LH surges. Energy and confidence are often at their highest. This window typically lasts 3–5 days around the actual egg release.",
  },
  {
    term: "Menstruation",
    aliases: ["menstrual", "period", "menses", "menstruating"],
    short: "The bleeding phase at the start of your cycle (typically days 1–5).",
    detail:
      "Hormone levels are at their lowest. Rest and recovery are especially important. It's normal to feel lower energy, but some people feel a sense of relief or reset.",
  },
  {
    term: "Estrogen",
    aliases: ["oestrogen"],
    short: "A key hormone that rises in the first half of your cycle.",
    detail:
      "Estrogen supports mood, energy, skin health, and cognitive function. It peaks just before ovulation, then has a smaller rise in the luteal phase before dropping before your period.",
  },
  {
    term: "Progesterone",
    aliases: [],
    short: "The dominant hormone in the second half of your cycle.",
    detail:
      "Progesterone rises after ovulation and promotes calm and sleep. When it drops sharply before your period, it can trigger PMS symptoms like irritability and anxiety.",
  },
  {
    term: "FSH",
    aliases: ["follicle-stimulating hormone", "follicle stimulating hormone"],
    short: "Follicle-Stimulating Hormone — it tells your ovaries to prepare an egg.",
    detail:
      "FSH rises at the start of your cycle to stimulate follicle growth. It works alongside estrogen in the follicular phase.",
  },
  {
    term: "LH",
    aliases: ["luteinizing hormone"],
    short: "Luteinizing Hormone — the trigger for ovulation.",
    detail:
      "LH surges sharply just before ovulation, signaling the release of the egg. Ovulation tests detect this surge.",
  },
  {
    term: "PMS",
    aliases: ["premenstrual syndrome", "pre-menstrual"],
    short: "Premenstrual Syndrome — symptoms that appear in the late luteal phase.",
    detail:
      "Caused by the drop in progesterone and estrogen before your period. Common symptoms include mood changes, bloating, fatigue, and cravings. Tracking helps you anticipate and prepare.",
  },
  {
    term: "Cycle day",
    aliases: ["day 1", "cd1"],
    short: "Day 1 is the first day of your period. Days count up from there.",
    detail:
      "A typical cycle is 21–35 days. Knowing your cycle day helps you understand which phase you're in and what to expect from your body and mind.",
  },
  {
    term: "Anchor symptom",
    aliases: [],
    short: "The one symptom you want to track most closely.",
    detail:
      "Logan uses your anchor symptom as a focal point for personalized insights. It's the signal that matters most to you — whether that's fatigue, mood dips, cramps, or something else.",
  },
];

// Build a regex that matches any glossary term or alias (case-insensitive, whole word)
function buildGlossaryRegex(): RegExp {
  const allTerms = CYCLE_GLOSSARY.flatMap((g) => [g.term, ...g.aliases])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first to avoid partial matches
  const escaped = allTerms.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
}

const glossaryRegex = buildGlossaryRegex();

function findGlossaryEntry(match: string): GlossaryTerm | undefined {
  const lower = match.toLowerCase();
  return CYCLE_GLOSSARY.find(
    (g) =>
      g.term.toLowerCase() === lower ||
      g.aliases.some((a) => a.toLowerCase() === lower)
  );
}

interface GlossaryTermChipProps {
  text: string;
  entry: GlossaryTerm;
}

function GlossaryTermChip({ text, entry }: GlossaryTermChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline underline decoration-dotted decoration-primary/40 underline-offset-2 text-inherit hover:decoration-primary/80 transition-colors cursor-help"
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 overflow-hidden"
        side="top"
        align="center"
        sideOffset={6}
      >
        <div className="px-4 py-3 bg-primary/5 border-b border-border/50">
          <p className="font-semibold text-sm text-foreground">{entry.term}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{entry.short}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {entry.detail}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Renders text with glossary terms highlighted and clickable.
 * Use in place of plain text rendering for chat messages.
 */
export function AnnotatedText({ text }: { text: string }) {
  const parts: (string | { match: string; entry: GlossaryTerm })[] = [];
  let lastIndex = 0;
  const seenTerms = new Set<string>();

  // Reset regex state
  glossaryRegex.lastIndex = 0;

  let result: RegExpExecArray | null;
  while ((result = glossaryRegex.exec(text)) !== null) {
    const matchText = result[0];
    const entry = findGlossaryEntry(matchText);
    if (!entry) continue;

    // Only annotate the first occurrence of each term
    const termKey = entry.term.toLowerCase();
    if (seenTerms.has(termKey)) continue;
    seenTerms.add(termKey);

    if (result.index > lastIndex) {
      parts.push(text.slice(lastIndex, result.index));
    }
    parts.push({ match: matchText, entry });
    lastIndex = result.index + matchText.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no terms found, return plain text
  if (parts.length === 1 && typeof parts[0] === "string") {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <GlossaryTermChip key={i} text={part.match} entry={part.entry} />
        )
      )}
    </>
  );
}
