import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { TOGETHER_CHANGED } from "@/lib/together";
import { WORDS_CHANGED, WORD_REPORT_REASONS, loadWords, reportWord, wordLabel, type TogetherWord, type WordReportReason } from "@/lib/togetherWords";

/** Words women added themselves. Shows only a label, or the count at 10 or more. Never exact counts under 10, never who. */
export function TogetherWordsSection() {
  const [words, setWords] = useState<TogetherWord[] | null>(null);
  const [error, setError] = useState(false);
  const [reporting, setReporting] = useState<TogetherWord | null>(null);

  const load = useCallback(() => {
    setError(false);
    loadWords().then(setWords).catch(() => setError(true));
  }, []);
  useEffect(() => {
    load();
    globalThis.addEventListener(WORDS_CHANGED, load);
    globalThis.addEventListener(TOGETHER_CHANGED, load);
    return () => { globalThis.removeEventListener(WORDS_CHANGED, load); globalThis.removeEventListener(TOGETHER_CHANGED, load); };
  }, [load]);

  const report = async (w: TogetherWord, reason: WordReportReason) => {
    setReporting(null);
    setWords((list) => list?.filter((x) => x.word !== w.word) ?? null);
    try { await reportWord(w.word, reason); toast("Thanks. I've hidden it for you and a person will look at it."); }
    catch { load(); toast.error("That report didn't send. Try again."); }
  };

  return (
    <section className="flex w-full flex-col gap-2 text-left" aria-labelledby="together-words-title">
      <h2 id="together-words-title" className="font-sans text-[15px] font-bold text-foreground">Words women added</h2>
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Couldn't load these words right now.</p>
          <button type="button" onClick={load} className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background">Try again</button>
        </div>
      ) : words === null ? (
        <div className="flex flex-wrap gap-2" aria-label="Loading">
          {[84, 120, 96, 72].map((w, i) => <div key={i} className="h-11 animate-pulse rounded-full bg-muted" style={{ width: w }} />)}
        </div>
      ) : words.length === 0 ? (
        <p className="text-sm text-muted-foreground">More will appear as more women share their own words.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {words.map((w) => (
            <li key={w.word} className="flex items-center gap-1 rounded-full border border-[#DDD7CC] bg-card py-1 pl-4 pr-1 dark:border-border">
              <span className="flex flex-col py-1 leading-tight">
                <span className="text-[15px] font-semibold text-foreground">{w.word}</span>
                <span className="text-xs text-muted-foreground">{wordLabel(w)}</span>
              </span>
              {!w.mine && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full text-muted-foreground" aria-label={`More options for ${w.word}`}><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setReporting(w)}>Report</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      <Drawer open={!!reporting} onOpenChange={(v) => !v && setReporting(null)}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle className="font-display text-2xl">Why are you reporting this?</DrawerTitle></DrawerHeader>
          <div className="flex flex-col gap-2 px-5 pb-8">
            {WORD_REPORT_REASONS.map((r) => <Button key={r.key} variant="outline" className="h-11 w-full rounded-full" onClick={() => reporting && void report(reporting, r.key)}>{r.label}</Button>)}
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
