import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { packSiblings } from "d3-hierarchy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  cycleLength?: number;
  hasCycle: boolean;
  onOpenSymptom: (name: string) => void;
  /** Shown under the caption when her logs aren't counted yet. */
  notCounted?: React.ReactNode;
}

export function TogetherBoard({ rows, mine, cats, cycleDay, cycleLength, hasCycle, onOpenSymptom, notCounted }: Props) {
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

  const len = cycleLength && cycleLength >= 20 && cycleLength <= 60 ? cycleLength : 28;
  const wrap = (d: number) => ((((d - 1) % len) + len) % len) + 1;
  const lo = wrap((cycleDay ?? 1) - 3), hi = wrap((cycleDay ?? 1) + 3);
  const stageRows = rows.filter((r) => r.filter === "stage");
  const topExact = (src: AggRow[]) => src.filter(isExact).sort((a, b) => b.women_count! - a.women_count!);
  const listSource = listPill === "week" ? weekRows : stageRows;
  const common = topExact(listSource);
  const rare = listSource.filter((r) => !isExact(r)).sort((a, b) => a.symptom.localeCompare(b.symptom));
  const cardTop = topExact(showWeek ? weekRows : stageRows).slice(0, 3);

  const Row = ({ r, top, rareRow }: { r: AggRow; top: number; rareRow?: boolean }) => {
    const safety = isSafetySymptom(r.symptom);
    const def = rareRow || safety ? knownSymptomDefinition(r.symptom) : null;
    const expandable = !!def || safety;
    const k = `${listPill}:${r.symptom}`;
    const exact = isExact(r);
    return (
      <li className="border-b border-[#EEE9DF] py-3 last:border-0 dark:border-border">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onOpenSymptom(r.symptom)} className="min-w-0 flex-1 text-left">
            <span className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
              {display(r.symptom)}
              {mine.has(key(r.symptom)) && <span className="rounded-full bg-[rgba(196,36,122,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[#C4247A]">You too</span>}
            </span>
            {exact && <span aria-hidden className="mt-1.5 block h-1 rounded-sm bg-[#EEE9DF] dark:bg-muted">
              <span className="block h-1 rounded-sm bg-[#0E8A8F]" style={{ width: `${Math.max(4, Math.round(((r.women_count ?? 0) / Math.max(1, top)) * 100))}%` }} />
            </span>}
          </button>
          <span className="min-w-[34px] shrink-0 whitespace-nowrap text-right text-[13px] font-semibold text-[#6E675F] dark:text-muted-foreground">{countLabel(r)}</span>
        </div>
        {expandable && (open === k ? (
          <div className="mt-1 text-sm text-muted-foreground">
            {def && <p>{def}</p>}
            {safety && <SafetyCallout className="mt-2" />}
            <button type="button" onClick={() => setOpen(null)} className="mt-1 text-[13px] font-semibold text-foreground">Less ⌃</button>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(k)} className="mt-1 text-[13px] font-semibold text-foreground">What's this? ⌄</button>
        ))}
      </li>
    );
  };

  const CARD = "rounded-[24px] bg-card px-[18px] py-1";
  const toggle = headSlot && createPortal(
    <button type="button" aria-label={view === "field" ? "See all as a list" : "Back to bubbles"} onClick={() => setView(view === "field" ? "list" : "field")}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground">
      {view === "field" ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" />
      </svg> : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="8" cy="9" r="4.5" /><circle cx="16.5" cy="8" r="3" /><circle cx="14" cy="17" r="3.5" />
      </svg>}
    </button>, headSlot);

  if (view === "list") {
    return (
      <div className="flex flex-col gap-4">
        {toggle}
        <PillRow>
          {showWeek && <Pill active={listPill === "week"} onClick={() => setListPill("week")}>Common in your week</Pill>}
          <Pill active={listPill === "stage"} onClick={() => setListPill("stage")}>Women in your stage</Pill>
        </PillRow>
        {listPill === "week" && <p className="text-[13px] text-[#6E675F] dark:text-muted-foreground">What women log most around day {lo} to {hi}</p>}
        {common.length > 0 && <ul className={CARD}>{common.map((r) => <Row key={r.symptom} r={r} top={common[0].women_count ?? 1} />)}</ul>}
        {rare.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-sans text-[15px] font-bold text-foreground">Is this just me?</h2>
            <p className="text-[13px] text-[#6E675F] dark:text-muted-foreground">No. Rarer, and just as real.</p>
            <ul className={CARD}>{rare.map((r) => <Row key={r.symptom} r={r} top={1} rareRow />)}</ul>
          </section>
        )}
        {common.length + rare.length < 3 && <p className="text-sm text-muted-foreground">{MORE}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {toggle}
      <p className="text-left text-base text-muted-foreground">{everyone.length} feelings, named by women like you.</p>
      <PillRow className="-mx-5 px-5">
        {CATEGORY_PILLS.map((p) => <Pill key={p.id} active={cat === p.id} onClick={() => setCat(p.id)}>{p.label}</Pill>)}
        <span aria-hidden className="w-3 shrink-0" />
      </PillRow>
      <BubbleCluster rows={shown} mine={mine} cats={cats} onOpen={onOpenSymptom} />
      {field.length < 3 && <p className="text-center text-sm text-muted-foreground">{MORE}</p>}
      <div className="flex flex-col items-start gap-1 text-left text-sm text-muted-foreground">
        <p>Bigger bubbles are felt by more women.</p>
        <p className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full border-[1.5px] border-[color:var(--bubble-ring)]" />Circled ones, you feel too.
        </p>
        <button type="button" onClick={() => setView("list")} className="relative py-1 text-left text-sm font-semibold text-foreground underline after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']">{field.length > shown.length ? `See all ${field.length} as a list ›` : "See all as a list ›"}</button>
      </div>
      {notCounted}
      <section className={CARD} aria-labelledby="together-around-days">
        <h2 id="together-around-days" className="pb-1 pt-3 font-sans text-[15px] font-bold text-foreground">{showWeek ? `What women log around day ${lo} to ${hi}` : "What women in your stage log most"}</h2>
        {cardTop.length ? <ul>
          {cardTop.map((r) => <Row key={r.symptom} r={r} top={cardTop[0].women_count ?? 1} />)}
          <li><button type="button" onClick={() => { setListPill(showWeek ? "week" : "stage"); setView("list"); }} className="w-full py-3 text-left text-[13px] font-semibold text-foreground">See all ›</button></li>
        </ul> : <p className="pb-3 text-[13px] text-[#6E675F] dark:text-muted-foreground">Once more women share, you'll see what's common around your days.</p>}
      </section>
    </div>
  );
}

const GAP = 2, R_MIN = 32, R_MAX = 51, BASE_W = 342;
function fillFor(c: TogetherCategory | undefined, t: number, i: number) {
  if (c === "sleep" || c === "mood") return `var(--bubble-${c}-${i % 3})`;
  const alpha = c === "body" ? (0.14 + 0.2 * t).toFixed(2) : "0.18";
  return `var(--bubble-body-dark, hsl(var(--bubble-body) / ${alpha}))`;
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
function BubbleCluster({ rows, mine, cats, onOpen }: {
  rows: AggRow[]; mine: Set<string>; cats: Map<string, TogetherCategory>; onOpen: (s: string) => void;
}) {
  // Area-proportional: radius follows sqrt(count), stretched over the shown set so close counts still differ.
  const roots = rows.filter(isExact).map((r) => Math.sqrt(r.women_count!));
  const lo = Math.min(...roots), hi = Math.max(...roots);
  const items: Bubble[] = rows.map((r, i) => {
    const t = !isExact(r) ? 0 : hi > lo ? (Math.sqrt(r.women_count!) - lo) / (hi - lo) : 0.5;
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
        const label = fitLabel(text, d / 2, 11.5 + 5.5 * b.t);
        return (
           <Button key={b.id} variant="ghost" type="button" onClick={() => onTap(b.id)} aria-label={b.selected ? `${b.label}, picked` : b.label}
             data-selected={b.selected ? "true" : "false"} data-ring={b.ring ? "true" : "false"}
             className="together-bubble absolute left-0 top-0 flex items-center justify-center rounded-full p-0 text-center font-semibold transition-[transform,opacity,background-color] duration-[400ms] ease-out motion-reduce:transition-none"
            style={{
               width: d, height: d, fontSize: label.fs, lineHeight: 1.15,
               background: b.selected ? "var(--bubble-selected-fill)" : b.fill,
              transform: ready ? `translate(${x}px, ${y}px) scale(1)` : `translate(${w / 2 - d / 2}px, ${4 + h / 2 - d / 2}px) scale(0.6)`,
              opacity: ready ? 1 : 0,
            }}>
            <span aria-hidden className="whitespace-nowrap">
              {label.lines.map((l, j) => <span key={j} className="block">{l}</span>)}
            </span>
           </Button>
        );
      })}
    </div>
  );
}
