import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { packSiblings } from "d3-hierarchy";
import { cn } from "@/lib/utils";
import { knownSymptomDefinition, isSafetySymptom } from "@/lib/symptomPage";
import { SafetyCallout } from "@/components/SafetyCallout";
import { AggRow, CATEGORY_PILLS, TogetherCategory, countLabel, display, isExact, key } from "@/lib/togetherData";

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn("relative flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-[13px] shadow-none after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        active ? "border-[#23201C] bg-[#23201C] font-semibold text-background dark:border-foreground dark:bg-foreground" : "border-[#DDD7CC] bg-card font-medium text-foreground dark:border-border")}>
      {children}
    </button>
  );
}

const FADE_MASK = "linear-gradient(to right, black calc(100% - 28px), transparent)";

/** Horizontal pill row that fades its right edge only while more pills are off-screen. */
function PillRow({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  const update = () => {
    const el = ref.current; if (!el) return;
    setFade(el.scrollWidth > el.clientWidth + 4 && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => { update(); }, [children]);
  return (
    <div ref={ref} onScroll={update} className={cn("flex gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]", className)}
      style={fade ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : undefined}>
      {children}
    </div>
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
  /** Shown under the caption when her logs aren't counted yet. */
  notCounted?: React.ReactNode;
}

export function TogetherBoard({ rows, mine, cats, cycleDay, hasCycle, onOpenSymptom, notCounted }: Props) {
  const [view, setView] = useState<"field" | "list">("field");
  const [headSlot, setHeadSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHeadSlot(document.getElementById("together-head-slot")); }, []);
  const [cat, setCat] = useState<"all" | TogetherCategory>("all");
  const weekRows = rows.filter((r) => r.filter === "cycle_day");
  const showWeek = hasCycle && !!cycleDay;
  const [listPill, setListPill] = useState<"week" | "stage">(showWeek ? "week" : "stage");
  const [open, setOpen] = useState<string | null>(null);

  const everyone = useMemo(() => rows.filter((r) => r.filter === "everyone"), [rows]);
  const field = useMemo(() => everyone
    .filter((r) => cat === "all" || cats.get(key(r.symptom)) === cat)
    .sort((a, b) => (b.women_count ?? 0) - (a.women_count ?? 0)), [everyone, cat, cats]);
  const shown = useMemo(() => {
    const hers = field.filter((r) => mine.has(key(r.symptom))).slice(0, 20);
    const others = field.filter((r) => !mine.has(key(r.symptom))).slice(0, 20 - hers.length);
    return [...hers, ...others].sort((x, y) => (y.women_count ?? 0) - (x.women_count ?? 0));
  }, [field, mine]);
  const max = Math.max(10, ...field.map((r) => r.women_count ?? 0));

  const listSource = listPill === "week" ? weekRows : rows.filter((r) => r.filter === "stage");
  const common = listSource.filter(isExact).sort((a, b) => b.women_count! - a.women_count!);
  const rare = listSource.filter((r) => !isExact(r)).sort((a, b) => a.symptom.localeCompare(b.symptom));

  const Row = ({ r, rareRow }: { r: AggRow; rareRow?: boolean }) => {
    const safety = isSafetySymptom(r.symptom);
    const def = rareRow || safety ? knownSymptomDefinition(r.symptom) : null;
    const expandable = !!def || safety;
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
        {expandable && (open === k ? (
          <div className="mt-1 text-sm text-muted-foreground">
            {def && <p>{def}</p>}
            {safety && <SafetyCallout className="mt-2" />}
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
        <PillRow>
          {showWeek && <Pill active={listPill === "week"} onClick={() => setListPill("week")}>Common in your week</Pill>}
          <Pill active={listPill === "stage"} onClick={() => setListPill("stage")}>Women in your stage</Pill>
        </PillRow>
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
      {headSlot && createPortal(
        <button type="button" aria-label="See all as a list" onClick={() => setView("list")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" />
          </svg>
        </button>, headSlot)}
      <p className="text-left text-base text-muted-foreground">{everyone.length} feelings, named by women like you.</p>
      <PillRow className="-mx-5 px-5">
        {CATEGORY_PILLS.map((p) => <Pill key={p.id} active={cat === p.id} onClick={() => setCat(p.id)}>{p.label}</Pill>)}
        <span aria-hidden className="w-3 shrink-0" />
      </PillRow>
      <BubbleCluster rows={shown} max={max} mine={mine} cats={cats} onOpen={onOpenSymptom} />
      {field.length < 3 && <p className="text-center text-sm text-muted-foreground">{MORE}</p>}
      <p className="text-center text-sm text-muted-foreground">
        Bigger bubbles are felt by more women.<br />
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full border-2 border-[#C4247A]" />Circled ones, you feel too.
        </span>
      </p>
      {notCounted}
      <button type="button" onClick={() => setView("list")} className="self-center text-sm font-semibold text-foreground underline">{field.length > shown.length ? `See all ${field.length} as a list ›` : "See all as a list ›"}</button>
    </div>
  );
}

const GAP = 4, R_MIN = 32, R_MAX = 51, BASE_W = 342;
const SLEEP = ["#DEE8F9", "#DFE7F9", "#DAEFF8"];
const MOOD = ["#E9D9FA", "#E6DDFA", "#E2E4F9"];

function fillFor(c: TogetherCategory | undefined, t: number, i: number) {
  if (c === "body") return `rgba(43,212,217,${(0.14 + 0.2 * t).toFixed(2)})`;
  if (c === "sleep") return SLEEP[i % 3];
  if (c === "mood") return MOOD[i % 3];
  return "rgba(43,212,217,0.18)";
}

/** d3 packSiblings, largest first, GAP/2 padding on each radius so neighbours sit GAP apart. */
function packCluster(radii: number[]) {
  const circles = radii.map((r, i) => ({ r: r + GAP / 2, i, x: 0, y: 0 }));
  packSiblings([...circles].sort((a, b) => b.r - a.r));
  return circles.map((c) => ({ x: c.x, y: c.y, r: c.r - GAP / 2 }));
}

let ctx: CanvasRenderingContext2D | null = null;
function measure(text: string, fs: number) {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * fs * 0.55;
  ctx.font = `600 ${fs}px Quicksand, sans-serif`;
  return ctx.measureText(text).width;
}

/** Up to two lines broken between words, largest font (min 11px) that fits inside the circle. */
function fitLabel(text: string, r: number, start: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const inner = Math.max(4, r - 5);
  const options: string[][] = [[words.join(" ")]];
  for (let k = 1; k < words.length; k++) options.push([words.slice(0, k).join(" "), words.slice(k).join(" ")]);
  for (let fs = Math.round(start); fs >= 11; fs -= 0.5) {
    const lh = fs * 1.15;
    for (const lines of options) {
      const edge = (lines.length * lh) / 2; // farthest line edge from center
      if (edge >= inner) continue;
      const avail = 2 * Math.sqrt(inner * inner - edge * edge);
      if (lines.every((l) => measure(l, fs) <= avail)) return { fs, lines };
    }
  }
  // Fallback at 11px: best two-line split by width, still no ellipsis.
  const best = options.reduce((a, b) => (Math.max(...b.map((l) => measure(l, 11))) < Math.max(...a.map((l) => measure(l, 11))) ? b : a));
  return { fs: 11, lines: best };
}

export interface Bubble { id: string; label: string; t: number; fill: string; ring?: boolean; star?: boolean; selected?: boolean }

/** Everyone lens: size by women, magenta ring for hers. */
function BubbleCluster({ rows, max, mine, cats, onOpen }: {
  rows: AggRow[]; max: number; mine: Set<string>; cats: Map<string, TogetherCategory>; onOpen: (s: string) => void;
}) {
  const items: Bubble[] = rows.map((r, i) => {
    const t = isExact(r) ? Math.sqrt((r.women_count! - 10) / Math.max(1, max - 10)) : 0;
    return { id: r.symptom, label: display(r.symptom), t, fill: fillFor(cats.get(key(r.symptom)), t, i), ring: mine.has(key(r.symptom)) };
  });
  return <BubbleField items={items} onTap={onOpen} />;
}

export function categoryFill(c: TogetherCategory | undefined, t: number, i: number) { return fillFor(c, t, i); }

/** Packed bubble field shared by Everyone, Mine and log mode. */
export function BubbleField({ items, onTap }: { items: Bubble[]; onTap: (id: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(BASE_W);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || BASE_W));
    ro.observe(el); setW(el.clientWidth || BASE_W);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(() => {
    const pts = packCluster(items.map((b) => R_MIN + (R_MAX - R_MIN) * b.t));
    if (!pts.length) return { pts, cx: 0, cy: 0, bw: 0, bh: 0 };
    const minX = Math.min(...pts.map((p) => p.x - p.r)), maxX = Math.max(...pts.map((p) => p.x + p.r));
    const minY = Math.min(...pts.map((p) => p.y - p.r)), maxY = Math.max(...pts.map((p) => p.y + p.r));
    return { pts, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, bw: maxX - minX, bh: maxY - minY };
  }, [items.map((b) => `${b.id}:${b.t.toFixed(3)}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const sig = items.map((b) => b.id).join("|");
  useEffect(() => { setReady(false); const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true))); return () => cancelAnimationFrame(id); }, [sig]);

  const fieldW = Math.min(w, BASE_W);
  const scale = layout.bw > 0 ? Math.min(fieldW / layout.bw, 1.6) : 1;
  const h = Math.max(0, layout.bh * scale);
  return (
    <div ref={wrap} className="relative w-full" style={{ height: h + 8 }}>
      {items.map((b, i) => {
        const p = layout.pts[i]; if (!p) return null;
        const d = p.r * 2 * scale;
        const x = w / 2 + (p.x - layout.cx) * scale - d / 2;
        const y = 4 + h / 2 + (p.y - layout.cy) * scale - d / 2;
        const text = `${b.selected ? "✓ " : ""}${b.star ? "★ " : ""}${b.label}`;
        const label = fitLabel(text, d / 2, 12 + 5 * b.t);
        return (
          <button key={b.id} type="button" onClick={() => onTap(b.id)} aria-label={b.label} aria-pressed={b.selected}
            className="absolute left-0 top-0 flex items-center justify-center rounded-full text-center font-semibold transition-[transform,opacity,background-color] duration-[400ms] ease-out motion-reduce:transition-none"
            style={{
              width: d, height: d, color: b.selected ? "#F4F1EA" : "#23201C", fontSize: label.fs, lineHeight: 1.15,
              background: b.selected ? "#23201C" : b.fill,
              boxShadow: b.ring && !b.selected ? "inset 0 0 0 2.5px #C4247A" : "none",
              transform: ready ? `translate(${x}px, ${y}px) scale(1)` : `translate(${w / 2 - d / 2}px, ${4 + h / 2 - d / 2}px) scale(0.6)`,
              opacity: ready ? 1 : 0,
            }}>
            <span aria-hidden className="whitespace-nowrap">
              {label.lines.map((l, j) => <span key={j} className="block">{l}</span>)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
