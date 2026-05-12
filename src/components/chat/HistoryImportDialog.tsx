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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, Download, Loader2, Upload } from "lucide-react";

interface HistoryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  onImported?: () => void;
}

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

const TEMPLATE_CSV = `date,period,cramps,bloating,mood,fatigue,sleep,energy
2025-01-01,1,3,2,2,3,3,2
2025-01-02,1,2,1,2,2,3,2
2025-01-03,1,1,0,3,2,4,3
2025-01-15,0,0,0,4,1,4,5
2025-01-22,0,0,2,2,3,3,2
2025-01-29,1,3,3,2,4,2,1
`;

export function HistoryImportDialog({
  open,
  onOpenChange,
  userId,
  onImported,
}: HistoryImportDialogProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{
    counts: { cycles: number; symptom_days: number; tracker_logs: number };
    recap: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase("idle");
    setProgress("");
    setResult(null);
    setError(null);
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

    setResult({
      counts: data.counts,
      recap: data.recap,
    });
    setPhase("done");
    onImported?.();
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "logan-history-template.csv";
    a.click();
    URL.revokeObjectURL(url);
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
          <>
            <Tabs defaultValue="apple" className="mt-2">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="apple">Apple Health</TabsTrigger>
                <TabsTrigger value="csv">Period app CSV</TabsTrigger>
                <TabsTrigger value="template">Generic CSV</TabsTrigger>
              </TabsList>
              <TabsContent value="apple" className="text-sm text-muted-foreground space-y-2 mt-3">
                <p>On your iPhone, open the <strong>Health</strong> app → tap your photo top-right → scroll down → <strong>Export All Health Data</strong>. AirDrop or email the resulting <code className="text-xs">export.zip</code> to yourself, then upload it here.</p>
                <p>Cycles, symptoms (cramps, mood, sleep, headaches…), sleep hours, and workouts will all import.</p>
              </TabsContent>
              <TabsContent value="csv" className="text-sm text-muted-foreground space-y-2 mt-3">
                <p>Most period trackers (Clue, Flo, Natural Cycles, Stardust, Apple Cycle Tracking) let you export a CSV from settings. Upload it as-is — Logan auto-detects the columns.</p>
              </TabsContent>
              <TabsContent value="template" className="text-sm text-muted-foreground space-y-3 mt-3">
                <p>Download Logan's template, fill it in from any source, and upload.</p>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" /> Download template
                </Button>
              </TabsContent>
            </Tabs>

            <div className="mt-4">
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
              <Button className="w-full" onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" /> Choose file (.zip, .xml, .csv)
              </Button>
              <p className="text-[11px] text-muted-foreground/80 mt-2 text-center">
                Files are processed and deleted right after. Max 60 MB. Up to 3 imports per day.
              </p>
            </div>
          </>
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
