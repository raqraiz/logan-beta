import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { knownSymptomDefinition } from "@/lib/symptomPage";
import { AggRow, CATEGORY_PILLS, TogetherCategory, countLabel, display, isExact, key } from "@/lib/togetherData";

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("flex items-center gap-1 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold",
        active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground")}>
      {children}
    </button>
  );
}

const MORE = "More will appear as more women join.";

export function BubbleSkeleton() {
  const sizes = [96, 64, 120, 72, 88, 60, 104, 70];
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-6" aria-label="Loading">
      {sizes.map((s, i) => <div key={i} className="animate-pulse rounded-full bg-muted" style={{ width: s, height: s }} />)}
    </div>
  );
}

interface Props {
  rows: AggRow[];
  mine: Set<string>;
  cats: Map<string, TogetherCategory>;
  cycleDay?: number;
  hasCycle: boolean;
  onOpenSymptom: (name: string) => void;
}

export function TogetherBoard({ rows, mine, cats, cycleDay, hasCycle, onOpenSymptom }: Props) {
  const [view, setView] = useState<"field" | "list">("field");
  const [cat, setCat] = useState<"all" | TogetherCategory>("all");
  const weekRows = rows.filter((r) => r.filter === "cycle_day");
  const showWeek = hasCycle && !!cycleDay;
  const [listPill, setListPill] = useState<"week" | "stage">(showWeek ? "week" : "stage");
  const [open, setOpen] = useState<string | null>(null);

  const everyone = useMemo(() => rows.filter((r) => r.filter === "everyone"), [rows]);
  const field = useMemo(() => everyone
    .filter((r) => cat === "all" || cats.get(key(r.symptom)) === cat)
    .sort((a, b) => (b.women_count ?? 0) - (a.women_count ?? 0)), [everyone, cat, cats]);
  const max = Math.max(10, ...field.map((r) => r.women_count ?? 0));
  const size = (r: AggRow) => (isExact(r) ? Math.round(64 + 48 * Math.sqrt((r.women_count! - 10) / Math.max(1, max - 10))) : 56);

  const listSource = listPill === "week" ? weekRows : rows.filter((r) => r.filter === "stage");
  const common = listSource.filter(isExact).sort((a, b) => b.women_count! - a.women_count!);
  const rare = listSource.filter((r) => !isExact(r)).sort((a, b) => a.symptom.localeCompare(b.symptom));

  const Row = ({ r, rareRow }: { r: AggRow; rareRow?: boolean }) => {
    const def = rareRow ? knownSymptomDefinition(r.symptom) : null;
    const k = `${listPill}:${r.symptom}`;
    return (
      <li className="border-b border-border py-3 last:border-0">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => onOpenSymptom(r.symptom)} className="flex items-baseline gap-2 text-left text-[15px] font-semibold text-foreground">
            {display(r.symptom)}
            {mine.has(key(r.symptom)) && <span className="text-xs font-semibold text-[#C4247A]">You too</span>}
          </button>
          <span className="shrink-0 text-sm text-muted-foreground">{countLabel(r)}</span>
        </div>
        {def && (open === k ? (
          <div className="mt-1 text-sm text-muted-foreground">
            <p>{def}</p>
            <button type="button" onClick={() => setOpen(null)} className="mt-1 text-xs font-semibold text-foreground">Less ⌃</button>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(k)} className="mt-1 text-xs font-semibold text-foreground">What's this? ⌄</button>
        ))}
      </li>
    );
  };

  if (view === "list") {
    const lo = Math.max(1, (cycleDay ?? 1) - 3), hi = (cycleDay ?? 1) + 3;
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => setView("field")} className="self-start text-sm font-semibold text-foreground underline">‹ Back to bubbles</button>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {showWeek && <Pill active={listPill === "week"} onClick={() => setListPill("week")}>Common in your week</Pill>}
          <Pill active={listPill === "stage"} onClick={() => setListPill("stage")}>Women in your stage</Pill>
        </div>
        {listPill === "week" && <p className="text-sm text-muted-foreground">What women log most around day {lo} to {hi}</p>}
        {common.length > 0 && <ul className="rounded-[22px] border border-border bg-card px-4">{common.map((r) => <Row key={r.symptom} r={r} />)}</ul>}
        {rare.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-2xl font-semibold text-foreground">Is this just me?</h2>
            <p className="text-sm text-muted-foreground">No. Rarer, and just as real.</p>
            <ul className="rounded-[22px] border border-border bg-card px-4">{rare.map((r) => <Row key={r.symptom} r={r} rareRow />)}</ul>
          </section>
        )}
        {common.length + rare.length < 3 && <p className="text-sm text-muted-foreground">{MORE}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-base text-muted-foreground">{everyone.length} feelings, named by women like you.</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORY_PILLS.map((p) => <Pill key={p.id} active={cat === p.id} onClick={() => setCat(p.id)}>{p.label}</Pill>)}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 py-4">
        {field.map((r) => {
          const s = size(r);
          return (
            <button key={r.symptom} type="button" onClick={() => onOpenSymptom(r.symptom)}
              className={cn("flex items-center justify-center rounded-full p-2 text-center text-xs font-semibold leading-tight text-[#0B7479] dark:text-[#2BD4D9]",
                mine.has(key(r.symptom)) && "ring-2 ring-foreground")}
              style={{ width: s, height: s, background: "rgba(14,138,143,0.10)" }}>
              {display(r.symptom)}
            </button>
          );
        })}
      </div>
      {field.length < 3 && <p className="text-center text-sm text-muted-foreground">{MORE}</p>}
      <p className="text-center text-sm text-muted-foreground">Bigger bubbles are felt by more women. Circled ones, you feel too.</p>
      <button type="button" onClick={() => setView("list")} className="self-center text-sm font-semibold text-foreground underline">See all as a list ›</button>
    </div>
  );
}
