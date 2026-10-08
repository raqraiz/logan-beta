import type { WordSuggestion } from "@/lib/wordSuggest";

interface Props { suggestions: WordSuggestion[]; onUse: (name: string) => void; onKeep: () => void }

/** Up to 3 existing words that may mean what she typed. One tap uses the existing word. */
export function WordSuggestRows({ suggestions, onUse, onKeep }: Props) {
  return (
    <ul className="mt-2 overflow-hidden rounded-[18px] border border-border bg-card" aria-label="Words that may match">
      {suggestions.map((s) => (
        <li key={s.name}>
          <button type="button" onClick={() => onUse(s.name)} className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left">
            <span className="text-[15px] font-semibold text-foreground">Did you mean {s.name}?</span>
            {s.label && <span className="text-xs text-muted-foreground">{s.label}</span>}
          </button>
        </li>
      ))}
      <li><button type="button" onClick={onKeep} className="w-full px-4 py-3 text-left text-[15px] font-semibold text-foreground">Keep mine</button></li>
    </ul>
  );
}
