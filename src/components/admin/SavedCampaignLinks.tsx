import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
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

export const SavedCampaignLinks = () => {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

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

  useEffect(() => {
    load();
  }, []);

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
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [links, filter]);

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
        <Button onClick={load} size="sm" variant="ghost" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
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
            No saved links yet. Use the builder above and click <strong>Shorten</strong> to save one.
          </p>
        )}

        {grouped.map(([campaign, items]) => (
          <div key={campaign} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span>{campaign}</span>
              <span className="text-xs text-muted-foreground">({items.length})</span>
            </div>
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
                      <div className="text-xs text-muted-foreground truncate">
                        {tags || "—"} · {(l.clicks ?? 0)} clicks
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
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
