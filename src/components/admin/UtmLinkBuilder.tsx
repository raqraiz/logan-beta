import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Link2, QrCode } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BASES = [
  { label: "asklogan.ai", value: "https://asklogan.ai" },
  { label: "www.asklogan.ai", value: "https://www.asklogan.ai" },
  { label: "logan-alpha-pilot.lovable.app", value: "https://logan-alpha-pilot.lovable.app" },
];

const MEDIUM_PRESETS = ["social", "email", "cpc", "referral", "affiliate", "organic", "podcast", "influencer", "qr"];
const SOURCE_PRESETS = ["instagram", "tiktok", "twitter", "linkedin", "facebook", "youtube", "newsletter", "brevo", "reddit", "producthunt"];

const slug = (v: string) =>
  v.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_\-.]/g, "");

export const UtmLinkBuilder = () => {
  const [base, setBase] = useState(BASES[0].value);
  const [path, setPath] = useState("/");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [term, setTerm] = useState("");
  const [content, setContent] = useState("");

  const url = useMemo(() => {
    try {
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      const u = new URL(cleanPath, base);
      const set = (k: string, v: string) => {
        const s = slug(v);
        if (s) u.searchParams.set(k, s);
      };
      set("utm_source", source);
      set("utm_medium", medium);
      set("utm_campaign", campaign);
      set("utm_term", term);
      set("utm_content", content);
      return u.toString();
    } catch {
      return "";
    }
  }, [base, path, source, medium, campaign, term, content]);

  const ready = !!(source && medium && campaign && url);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Paste it wherever you're promoting." });
    } catch {
      toast({ title: "Couldn't copy", description: "Select the link and copy manually.", variant: "destructive" });
    }
  };

  const qrUrl = ready
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`
    : "";

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Link2 className="w-4 h-4" /> UTM link builder
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Build trackable links. Source, medium, and campaign are required.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Destination</Label>
            <Select value={base} onValueChange={setBase}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BASES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Path</Label>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Source *</Label>
            <Input list="utm-sources" value={source} onChange={(e) => setSource(e.target.value)} placeholder="instagram" />
            <datalist id="utm-sources">{SOURCE_PRESETS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Medium *</Label>
            <Input list="utm-mediums" value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="social" />
            <datalist id="utm-mediums">{MEDIUM_PRESETS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Campaign *</Label>
            <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="launch_june" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Term</Label>
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs text-muted-foreground">Content</Label>
            <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="optional (e.g. story_swipe_up)" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Generated link</Label>
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copy} disabled={!ready} size="sm">
              <Copy className="w-4 h-4 mr-2" /> Copy
            </Button>
          </div>
          {!ready && (
            <p className="text-xs text-muted-foreground">Fill source, medium, and campaign to generate.</p>
          )}
        </div>

        {ready && (
          <div className="flex items-start gap-4 pt-2 border-t border-border">
            <div className="flex flex-col items-center gap-1">
              <img src={qrUrl} alt="QR code for tracked link" width={120} height={120} className="rounded bg-white p-1" />
              <a href={qrUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <QrCode className="w-3 h-3" /> Open QR
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              Print or screenshot the QR for offline channels. Scans land on the same tracked URL and show up in the dashboard above.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
