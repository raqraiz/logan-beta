import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RANGE_LABELS, type RangeKey } from "@/lib/backOffice/math";

/** Back office look: Paper #F4F1EA, Ink #23201C, secondary #6E675F, borders #E6E0D5, white cards (22px), pill controls. */
export const INK = "#23201C";
export const MUTED = "#6E675F";
export const LINE = "#E6E0D5";
export const SELECTED = "rgba(43,212,217,0.42)";

/** Big figures: Quicksand 700 with tabular figures (Cormorant is for headings only). */
export const Figure = ({ size, children, className = "" }: { size: number; children: ReactNode; className?: string }) => (
  <span
    className={`block leading-none text-[#23201C] ${className}`}
    style={{ fontFamily: "Quicksand, system-ui, sans-serif", fontWeight: 700, fontSize: size, fontVariantNumeric: "tabular-nums" }}
  >
    {children}
  </span>
);

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={`rounded-[22px] border border-[#E6E0D5] bg-white p-5 ${className}`}>{children}</section>
);

export const CardTitle = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
    <h2 className="font-display text-xl font-semibold text-[#23201C]">{children}</h2>
    {aside}
  </div>
);

export const InfoTip = ({ text }: { text: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label="What this means" className="inline-flex align-middle text-[#6E675F] hover:text-[#23201C]">
        <Info className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-64 border-[#E6E0D5] bg-white text-xs leading-relaxed text-[#23201C]">{text}</PopoverContent>
  </Popover>
);

/** Pill toggle in a white pill container. Selected: teal fill, Ink text, one ✓. Unselected: transparent, secondary text.
 *  Uses radio semantics on purpose: the app's global style adds its own ✓ and ink fill to any aria-pressed button. */
export function PillToggle<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border border-[#E6E0D5] bg-white p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${on ? "text-[#23201C]" : "text-[#6E675F] hover:text-[#23201C]"}`}
            style={{ background: on ? SELECTED : "transparent" }}
          >
            {on ? "✓ " : ""}{o.label}
          </button>
        );
      })}
    </div>
  );
}

export const RangeToggle = ({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) => (
  <PillToggle<RangeKey>
    label="Date range"
    value={value}
    onChange={onChange}
    options={(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
  />
);

/** Main button: Ink fill, Paper text. */
export const MainButton = ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    {...rest}
    className={`rounded-full bg-[#23201C] px-4 py-2 text-sm font-semibold text-[#F4F1EA] disabled:opacity-50 ${rest.className ?? ""}`}
  >
    {children}
  </button>
);

export const GhostButton = ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    {...rest}
    className={`rounded-full border border-[#E6E0D5] bg-white px-3.5 py-1.5 text-sm font-medium text-[#23201C] hover:border-[#23201C]/40 disabled:opacity-50 ${rest.className ?? ""}`}
  >
    {children}
  </button>
);

export const Failed = ({ onRetry }: { onRetry: () => void }) => (
  <p className="text-sm text-[#6E675F]">
    Couldn't load this. <button type="button" onClick={onRetry} className="font-semibold text-[#23201C] underline underline-offset-2">Try again</button>
  </p>
);

/** Loads on mount and whenever `deps` change; keeps the last good value while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(false);
    fn()
      .then((d) => { if (id === seq.current) setData(d); })
      .catch(() => { if (id === seq.current) setError(true); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run };
}
