import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, Copy, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ShortLink {
  id: string;
  slug: string;
  target_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  clicks: number | null;
  created_at: string;
}

const SHORT_BASE = "https://asklogan.ai/s/";

// Signups are attributed by the UTM triple a link encodes (campaign+source+medium),
// because short links do NOT carry their slug through to the signup record — only
// utm_source / utm_medium / utm_campaign are persisted on profiles.
// TODO(schema): true per-slug attribution would need a new column (e.g.
// profiles.short_link_slug or utm_content stamped with the slug) plus a migration
// and a change to the /s/:slug redirect. Intentionally NOT built here.
const utmKey = (campaign?: string | null, source?: string | null, medium?: string | null) =>
  [campaign ?? "", source ?? "", medium ?? ""].map((v) => v.toLowerCase().trim()).join("|");

export const SavedCampaignLinks = () => {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [signupCounts, setSignupCounts] = useState<Map<string, number> | null>(null);
  const [countsError, setCountsError] = useState(false);
  const [sortMode, setSortMode] = useState<"newest" | "top">("newest");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filtering while scrolled down should reveal matches from the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filter, sortMode]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("short_links")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Couldn't load links", description: error.message, variant: "destructive" });
    } else {
      setLinks(data || []);
    }
    setLoading(false);
  };

  const loadSignupCounts = async () => {
    setSignupCounts(null);
    setCountsError(false);
    const { data, error } = await supabase
      .from("profiles")
      .select("utm_campaign, utm_source, utm_medium")
      .not("utm_campaign", "is", null)
      .limit(10000);
    if (error) {
      setCountsError(true);
      return;
    }
    const map = new Map<string, number>();
    for (const row of (data ?? []) as any[]) {
      const k = utmKey(row.utm_campaign, row.utm_source, row.utm_medium);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    setSignupCounts(map);
  };

  useEffect(() => {
    load();
    loadSignupCounts();
  }, []);

  // There is no campaign entity in the schema — launch date is derived as the
  // earliest created_at among the campaign's saved short links.
  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? links.filter((l) =>
          [l.utm_campaign, l.utm_source, l.utm_medium, l.slug, l.target_url]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(f))
        )
      : links;
    const map = new Map<string, ShortLink[]>();
    for (const l of filtered) {
      const key = l.utm_campaign || "(no campaign)";
      const arr = map.get(key) || [];
      arr.push(l);
      map.set(key, arr);
    }
    const rows = Array.from(map.entries())
      .filter(([, items]) => items.length > 0) // never render an empty accordion
      .map(([campaign, items]) => {
        const launchedAt = Math.min(...items.map((l) => new Date(l.created_at).getTime()));
        // Campaign total = sum over the distinct utm triples its links encode.
        let conversions: number | null = null;
        if (signupCounts) {
          const seen = new Set<string>();
          conversions = 0;
          for (const l of items) {
            const k = utmKey(l.utm_campaign, l.utm_source, l.utm_medium);
            if (seen.has(k)) continue;
            seen.add(k);
            conversions += signupCounts.get(k) ?? 0;
          }
        }
        return { campaign, items, launchedAt, conversions };
      });

    if (sortMode === "newest") {
      rows.sort((a, b) => b.launchedAt - a.launchedAt || a.campaign.localeCompare(b.campaign));
    } else {
      // Ties broken by launch date (newest first) so ordering stays stable.
      rows.sort(
        (a, b) => (b.conversions ?? 0) - (a.conversions ?? 0) || b.launchedAt - a.launchedAt
      );
    }
    return rows;
  }, [links, filter, signupCounts, sortMode]);

  const isFiltering = filter.trim().length > 0;
  // While filtering, every group with matches auto-expands so results stay visible.
  const isOpen = (campaign: string) => isFiltering || openGroups.has(campaign);
  const allOpen = grouped.length > 0 && grouped.every((g) => openGroups.has(g.campaign));

  const toggleGroup = (campaign: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(campaign)) next.delete(campaign);
      else next.add(campaign);
      return next;
    });

  const toggleAll = () =>
    setOpenGroups(allOpen ? new Set() : new Set(grouped.map((g) => g.campaign)));


  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: text });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this short link? Any existing shared copies will stop working.")) return;
    const { error } = await (supabase as any).from("short_links").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const renderSignups = (l: ShortLink) => {
    if (countsError) {
      return <span className="text-destructive">signups unavailable</span>;
    }
    if (!signupCounts) {
      return <Skeleton className="inline-block h-3 w-16 align-middle" />;
    }
    const n = signupCounts.get(utmKey(l.utm_campaign, l.utm_source, l.utm_medium)) ?? 0;
    return (
      <span className={n > 0 ? "text-foreground font-medium" : undefined}>
        {n} signup{n === 1 ? "" : "s"}
      </span>
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-foreground flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Saved campaign links
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Reuse any short link below. Grouped by campaign.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {grouped.length > 0 && (
            <Button onClick={toggleAll} size="sm" variant="ghost" disabled={isFiltering}>
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          )}
          <Button onClick={() => { load(); loadSignupCounts(); }} size="sm" variant="ghost" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Filter by campaign, source, medium, slug…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isFiltering
              ? "No links match that filter."
              : "No saved links yet. Use the builder above and click Shorten to save one."}
          </p>
        )}

        {grouped.map(([campaign, items]) => {
          const open = isOpen(campaign);
          return (
            <div key={campaign} className="space-y-2">
              <button
                type="button"
                onClick={() => toggleGroup(campaign)}
                className="w-full flex items-center gap-2 text-sm font-semibold text-foreground rounded px-1 py-1.5 hover:bg-muted/50 transition-colors"
              >
                {open ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <span>{campaign}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {items.length} link{items.length === 1 ? "" : "s"}
                </span>
              </button>
              {open && (
                <div className="space-y-2">
                  {items.map((l) => {
                    const short = `${SHORT_BASE}${l.slug}`;
                    const tags = [l.utm_source, l.utm_medium, l.utm_content, l.utm_term]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div
                        key={l.id}
                        className="rounded border border-border bg-background/40 p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                            <span>{tags || "—"}</span>
                            <span>·</span>
                            {renderSignups(l)}
                            <span>·</span>
                            <span>{l.clicks ?? 0} clicks</span>
                          </div>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => copy(short)}>
                              <Copy className="w-3.5 h-3.5 mr-1.5" /> Short
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => copy(l.target_url)}>
                              <Copy className="w-3.5 h-3.5 mr-1.5" /> Full
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => remove(l.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="font-mono text-xs text-foreground truncate">{short}</div>
                        <div className="font-mono text-[11px] text-muted-foreground truncate">
                          → {l.target_url}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
