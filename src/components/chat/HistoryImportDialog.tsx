import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, FlaskConical, ImagePlus, Loader2, Upload, X } from "lucide-react";

interface HistoryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  onImported?: () => void;
}

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

const MAX_SCREENSHOTS = 6;

export function HistoryImportDialog({
  open,
  onOpenChange,
  userId,
  onImported,
}: HistoryImportDialogProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<
    | { kind: "history"; counts: { cycles: number; symptom_days: number; tracker_logs: number }; recap: string }
    | { kind: "lab"; marker_count: number; flagged_count: number; taken_on: string | null; recap: string }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [labImages, setLabImages] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const screenshotsRef = useRef<HTMLInputElement>(null);
  const labImagesRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase("idle");
    setProgress("");
    setResult(null);
    setError(null);
    setPasted("");
    setScreenshots([]);
    setLabImages([]);
  };

  const handleResult = (data: { counts: { cycles: number; symptom_days: number; tracker_logs: number }; recap: string }) => {
    setResult({ counts: data.counts, recap: data.recap });
    setPhase("done");
    onImported?.();
  };

  const handleFile = async (file: File) => {
    if (!userId) {
      toast({ title: "Sign in first", variant: "destructive" });
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".zip") && !lower.endsWith(".xml") && !lower.endsWith(".csv")) {
      toast({
        title: "Unsupported file",
        description: "Upload a .zip (Apple Health), .xml, or .csv file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 60 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Max 60 MB. Try exporting a shorter range.",
        variant: "destructive",
      });
      return;
    }

    reset();
    setPhase("uploading");
    setProgress(`Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB…`);

    const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const { error: upErr } = await supabase.storage
      .from("history-imports")
      .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (upErr) {
      setPhase("error");
      setError(upErr.message);
      return;
    }

    setPhase("processing");
    setProgress("Reading your history… this can take a minute for large exports.");

    const sourceHint = lower.endsWith(".csv") ? "csv" : "apple_health";
    const { data, error: fnErr } = await supabase.functions.invoke("import-history", {
      body: { storage_path: path, source_hint: sourceHint },
    });

    if (fnErr || (data as { error?: string })?.error) {
      setPhase("error");
      setError((data as { error?: string })?.error || fnErr?.message || "Import failed");
      return;
    }
    handleResult(data);
  };

  const handlePasteSubmit = async () => {
    if (!userId) {
      toast({ title: "Sign in first", variant: "destructive" });
      return;
    }
    const text = pasted.trim();
    if (text.length < 10) {
      toast({ title: "Add some data", description: "Paste at least a few rows.", variant: "destructive" });
      return;
    }
    setPhase("processing");
    setProgress("Reading your data…");
    const { data, error: fnErr } = await supabase.functions.invoke("import-history", {
      body: { pasted_text: text, source_hint: "pasted" },
    });
    if (fnErr || (data as { error?: string })?.error) {
      setPhase("error");
      setError((data as { error?: string })?.error || fnErr?.message || "Import failed");
      return;
    }
    handleResult(data);
  };

  const addScreenshots = (files: FileList | null) => {
    if (!files) return;
    const next = [...screenshots];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) {
        toast({ title: `${f.name} is too large`, description: "Max 8 MB per image.", variant: "destructive" });
        continue;
      }
      if (next.length >= MAX_SCREENSHOTS) break;
      next.push(f);
    }
    setScreenshots(next);
  };

  const handleScreenshotsSubmit = async () => {
    if (!userId) {
      toast({ title: "Sign in first", variant: "destructive" });
      return;
    }
    if (!screenshots.length) {
      toast({ title: "Add at least one screenshot", variant: "destructive" });
      return;
    }
    setPhase("uploading");
    setProgress(`Uploading ${screenshots.length} image${screenshots.length === 1 ? "" : "s"}…`);

    const paths: string[] = [];
    for (const f of screenshots) {
      const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "png"}`;
      const { error: upErr } = await supabase.storage
        .from("history-imports")
        .upload(path, f, { upsert: false, contentType: f.type || "image/png" });
      if (upErr) {
        setPhase("error");
        setError(upErr.message);
        return;
      }
      paths.push(path);
    }

    setPhase("processing");
    setProgress("Logan is reading your screenshots…");
    const { data, error: fnErr } = await supabase.functions.invoke("import-history", {
      body: { image_paths: paths, source_hint: "screenshot" },
    });
    if (fnErr || (data as { error?: string })?.error) {
      setPhase("error");
      setError((data as { error?: string })?.error || fnErr?.message || "Import failed");
      return;
    }
    handleResult(data);
  };


  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import your history</DialogTitle>
          <DialogDescription>
            Bring months of cycle, symptom, sleep, and workout data from another app.
            Logan uses it instantly for analytics, predictions, and chat memory.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <Tabs defaultValue="apple" className="mt-2">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="apple" className="text-xs">Apple Health</TabsTrigger>
              <TabsTrigger value="csv" className="text-xs">CSV</TabsTrigger>
              <TabsTrigger value="paste" className="text-xs">Paste</TabsTrigger>
              <TabsTrigger value="screenshot" className="text-xs">Screenshot</TabsTrigger>
            </TabsList>

            <TabsContent value="apple" className="text-sm text-muted-foreground space-y-3 mt-3">
              <p>On your iPhone, open the <strong>Health</strong> app → tap your photo top-right → scroll down → <strong>Export All Health Data</strong>. AirDrop or email the resulting <code className="text-xs">export.zip</code> to yourself, then upload it here.</p>
              <p>Cycles, symptoms (cramps, mood, sleep, headaches…), sleep hours, and workouts will all import.</p>
              <Button className="w-full" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> Choose .zip or .xml
              </Button>
            </TabsContent>

            <TabsContent value="csv" className="text-sm text-muted-foreground space-y-3 mt-3">
              <p>Most period trackers (Clue, Flo, Natural Cycles, Stardust, Apple Cycle Tracking) let you export a CSV from settings. Upload it as-is — Logan auto-detects the columns.</p>
              <Button className="w-full" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> Choose .csv
              </Button>
            </TabsContent>

            <TabsContent value="paste" className="text-sm text-muted-foreground space-y-3 mt-3">
              <p>Copy rows directly from Excel, Google Sheets, Numbers, or Notes — Logan reads commas or tabs.</p>
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={"date,period,cramps,mood,sleep\n2025-01-01,1,3,2,3\n2025-01-15,0,0,4,4\n2025-01-29,1,2,2,3"}
                className="min-h-[180px] font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground/80">
                Include a header row with at least a <code>date</code> column. Period column can be 1/0 or true/false. Symptom columns can be 0–5 or words like mild/moderate/severe.
              </p>
              <Button className="w-full" onClick={handlePasteSubmit} disabled={!pasted.trim()}>
                Import pasted data
              </Button>
            </TabsContent>

            <TabsContent value="screenshot" className="text-sm text-muted-foreground space-y-3 mt-3">
              <p>Upload up to {MAX_SCREENSHOTS} screenshots of your period-tracker calendar. Logan will read the dates and symptoms with AI.</p>
              {screenshots.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {screenshots.map((f, i) => (
                    <div key={i} className="relative group rounded-md overflow-hidden border border-border/50 aspect-square">
                      <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 rounded-full p-0.5"
                        aria-label="Remove"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={screenshotsRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addScreenshots(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => screenshotsRef.current?.click()}
                  disabled={screenshots.length >= MAX_SCREENSHOTS}
                >
                  <ImagePlus className="w-4 h-4 mr-2" />
                  {screenshots.length ? `Add more (${screenshots.length}/${MAX_SCREENSHOTS})` : "Add screenshots"}
                </Button>
                <Button className="flex-1" onClick={handleScreenshotsSubmit} disabled={!screenshots.length}>
                  Import
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/80">
                Clearer screenshots = better extraction. AI may miss data on cluttered or low-resolution images.
              </p>
            </TabsContent>


            <input
              ref={fileRef}
              type="file"
              accept=".zip,.xml,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
            <p className="text-[11px] text-muted-foreground/80 mt-3 text-center">
              Files and screenshots are processed and deleted right after. Up to 3 imports per day.
            </p>
          </Tabs>
        )}

        {(phase === "uploading" || phase === "processing") && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground text-center">{progress}</p>
          </div>
        )}

        {phase === "done" && result && (
          <div className="py-4 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Import complete</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.counts.cycles} cycles · {result.counts.symptom_days} symptom days · {result.counts.tracker_logs} tracker entries
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-secondary/30 border border-border/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Logan just messaged you in chat:</p>
              <p className="text-sm leading-relaxed">{result.recap}</p>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Open chat
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-destructive">{error || "Something went wrong."}</p>
            <Button variant="outline" className="w-full" onClick={reset}>
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
