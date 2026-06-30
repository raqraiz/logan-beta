import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { BlobReader, ZipReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.45/index.js";
import { parse as parseCsv } from "https://deno.land/std@0.224.0/csv/parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BYTES = 60 * 1024 * 1024; // 60 MB
const MAX_PER_DAY = 3;

// ---- Apple Health type maps ----
const APPLE_PERIOD_TYPE = "HKCategoryTypeIdentifierMenstrualFlow";
const APPLE_SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";
const APPLE_WORKOUT_TAG = "Workout";

// HealthKit symptom identifiers → Logan canonical symptom
const APPLE_SYMPTOM_MAP: Record<string, string> = {
  HKCategoryTypeIdentifierAbdominalCramps: "cramps",
  HKCategoryTypeIdentifierBloating: "bloating",
  HKCategoryTypeIdentifierAcne: "acne",
  HKCategoryTypeIdentifierBreastPain: "breast tenderness",
  HKCategoryTypeIdentifierHeadache: "headache",
  HKCategoryTypeIdentifierFatigue: "fatigue",
  HKCategoryTypeIdentifierMoodChanges: "mood swings",
  HKCategoryTypeIdentifierLowerBackPain: "back pain",
  HKCategoryTypeIdentifierNausea: "nausea",
  HKCategoryTypeIdentifierSleepChanges: "sleep issues",
  HKCategoryTypeIdentifierAppetiteChanges: "appetite changes",
  HKCategoryTypeIdentifierConstipation: "constipation",
  HKCategoryTypeIdentifierDiarrhea: "diarrhea",
  HKCategoryTypeIdentifierDizziness: "dizziness",
  HKCategoryTypeIdentifierHotFlashes: "hot flashes",
  HKCategoryTypeIdentifierNightSweats: "night sweats",
  HKCategoryTypeIdentifierVaginalDryness: "vaginal dryness",
};

// CSV header sniffing (Clue, Flo, Natural Cycles, generic)
const DATE_HEADERS = ["date", "day", "logged_at", "timestamp", "datetime"];
const PERIOD_HEADERS = ["period", "menstruation", "menstrual_flow", "flow", "bleeding", "is_period"];
const SYMPTOM_KEYWORDS = [
  "cramps","bloating","headache","fatigue","mood","anxiety","irritability","acne",
  "breast","back","nausea","insomnia","sleep","appetite","cravings","energy",
  "hot flash","night sweat","constipation","diarrhea","dizziness",
];

type CycleRow = { participant_id: string; cycle_start_date: string; cycle_end_date: string; cycle_length_days: number };
type SymptomRow = { user_id: string; symptoms: { name: string; intensity: number }[]; logged_at: string; notes: string | null };
type TrackerLogRow = { user_id: string; tracker_id: string; intensity: number; logged_at: string; notes: string | null };

function parseDateOnly(s: string): string | null {
  if (!s) return null;
  const m = String(s).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function dayDiff(a: string, b: string): number {
  const ms = new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

// ---- Apple Health XML streaming-ish parse ----
type AppleParsed = {
  periodDays: Set<string>;
  symptomsByDay: Map<string, Map<string, number>>; // day -> symptom -> count
  sleepByDay: Map<string, number>; // hours
  workoutsByDay: Map<string, number>; // count
  earliest: string | null;
  latest: string | null;
};

function parseAppleHealthXml(xml: string): AppleParsed {
  const out: AppleParsed = {
    periodDays: new Set(),
    symptomsByDay: new Map(),
    sleepByDay: new Map(),
    workoutsByDay: new Map(),
    earliest: null,
    latest: null,
  };

  const recordRe = /<(Record|Workout)\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = recordRe.exec(xml)) !== null) {
    const tag = m[1];
    const attrs = m[2];
    const get = (k: string) => {
      const r = new RegExp(`${k}="([^"]*)"`).exec(attrs);
      return r ? r[1] : "";
    };
    const startDateRaw = get("startDate");
    const endDateRaw = get("endDate");
    const day = parseDateOnly(startDateRaw);
    if (!day) continue;
    if (!out.earliest || day < out.earliest) out.earliest = day;
    if (!out.latest || day > out.latest) out.latest = day;

    if (tag === "Workout") {
      out.workoutsByDay.set(day, (out.workoutsByDay.get(day) ?? 0) + 1);
      continue;
    }

    const type = get("type");
    const value = get("value");

    if (type === APPLE_PERIOD_TYPE) {
      // Any non-"None" flow value counts as a period day
      if (value && !/none/i.test(value)) out.periodDays.add(day);
      continue;
    }

    if (type === APPLE_SLEEP_TYPE) {
      const start = new Date(startDateRaw).getTime();
      const end = new Date(endDateRaw).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        // Apple uses a few "InBed"/"Asleep" subtypes; count anything with "Asleep" in the value
        if (/asleep|inbed/i.test(value) || !value) {
          const hours = (end - start) / 3600000;
          out.sleepByDay.set(day, (out.sleepByDay.get(day) ?? 0) + hours);
        }
      }
      continue;
    }

    const symptom = APPLE_SYMPTOM_MAP[type];
    if (symptom) {
      const map = out.symptomsByDay.get(day) ?? new Map<string, number>();
      // Apple symptom values: 0/1/2 → none/mild/moderate; severe = 3
      const intensity = value === "HKCategoryValueSeverityNotPresent" ? 0
        : value === "HKCategoryValueSeverityMild" ? 2
        : value === "HKCategoryValueSeverityModerate" ? 3
        : value === "HKCategoryValueSeveritySevere" ? 5
        : 3;
      if (intensity > 0) map.set(symptom, Math.max(map.get(symptom) ?? 0, intensity));
      out.symptomsByDay.set(day, map);
    }
  }
  return out;
}

// Group consecutive period days into cycles
function periodDaysToCycles(days: Set<string>): { start: string; end: string; length: number }[] {
  const sorted = Array.from(days).sort();
  if (sorted.length === 0) return [];
  // A cycle starts on a period day that is >2 days after the previous period day
  const cycleStarts: string[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (dayDiff(sorted[i - 1], sorted[i]) > 2) cycleStarts.push(sorted[i]);
  }
  const cycles: { start: string; end: string; length: number }[] = [];
  for (let i = 0; i < cycleStarts.length - 1; i++) {
    const start = cycleStarts[i];
    const next = cycleStarts[i + 1];
    const length = dayDiff(start, next);
    if (length >= 18 && length <= 60) {
      const end = new Date(new Date(next + "T12:00:00Z").getTime() - 86400000)
        .toISOString().slice(0, 10);
      cycles.push({ start, end, length });
    }
  }
  return cycles;
}

// ---- CSV parsing ----
function parseGenericCsv(text: string): {
  cycleStarts: string[];
  symptomsByDay: Map<string, Map<string, number>>;
  earliest: string | null;
  latest: string | null;
} {
  const out = {
    cycleStarts: [] as string[],
    symptomsByDay: new Map<string, Map<string, number>>(),
    earliest: null as string | null,
    latest: null as string | null,
  };
  let rows: Record<string, string>[];
  try {
    rows = parseCsv(text, { skipFirstRow: true }) as unknown as Record<string, string>[];
  } catch {
    return out;
  }
  if (!rows.length) return out;

  const headers = Object.keys(rows[0]).map((h) => h.toLowerCase().trim());
  const dateKey = Object.keys(rows[0]).find((h) => DATE_HEADERS.includes(h.toLowerCase().trim()));
  const periodKey = Object.keys(rows[0]).find((h) => PERIOD_HEADERS.includes(h.toLowerCase().trim()));
  if (!dateKey) return out;

  const symptomKeys = Object.keys(rows[0]).filter((h) =>
    SYMPTOM_KEYWORDS.some((k) => h.toLowerCase().includes(k))
  );

  for (const row of rows) {
    const day = parseDateOnly(row[dateKey]);
    if (!day) continue;
    if (!out.earliest || day < out.earliest) out.earliest = day;
    if (!out.latest || day > out.latest) out.latest = day;

    if (periodKey) {
      const v = (row[periodKey] ?? "").toString().toLowerCase().trim();
      if (v && !["", "0", "false", "no", "none"].includes(v)) {
        // Only mark as cycle start when this is the first day in a contiguous run
        out.cycleStarts.push(day);
      }
    }

    for (const sk of symptomKeys) {
      const raw = (row[sk] ?? "").toString().trim();
      if (!raw) continue;
      const num = Number(raw);
      let intensity = 0;
      if (Number.isFinite(num)) {
        intensity = num <= 1 ? Math.round(num * 5) : Math.min(5, Math.max(1, Math.round(num)));
      } else if (/severe|heavy/i.test(raw)) intensity = 5;
      else if (/moderate|medium/i.test(raw)) intensity = 3;
      else if (/mild|light/i.test(raw)) intensity = 2;
      else if (/yes|true/i.test(raw)) intensity = 3;
      if (intensity <= 0) continue;
      const name = sk.toLowerCase().replace(/[_-]+/g, " ").trim();
      const map = out.symptomsByDay.get(day) ?? new Map<string, number>();
      map.set(name, Math.max(map.get(name) ?? 0, intensity));
      out.symptomsByDay.set(day, map);
    }
  }

  // Collapse contiguous period days into cycle starts
  const sorted = Array.from(new Set(out.cycleStarts)).sort();
  const collapsed: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || dayDiff(sorted[i - 1], sorted[i]) > 2) collapsed.push(sorted[i]);
  }
  out.cycleStarts = collapsed;

  return out;
}

function cycleStartsToCycles(starts: string[]): { start: string; end: string; length: number }[] {
  const out: { start: string; end: string; length: number }[] = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const length = dayDiff(starts[i], starts[i + 1]);
    if (length >= 18 && length <= 60) {
      const end = new Date(new Date(starts[i + 1] + "T12:00:00Z").getTime() - 86400000)
        .toISOString().slice(0, 10);
      out.push({ start: starts[i], end, length });
    }
  }
  return out;
}

// ---- Screenshot vision extraction ----
async function extractFromScreenshots(
  admin: ReturnType<typeof createClient>,
  paths: string[],
): Promise<{
  cycleStarts: string[];
  symptomsByDay: Map<string, Map<string, number>>;
  earliest: string | null;
  latest: string | null;
} | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const imageParts: { type: "image_url"; image_url: { url: string } }[] = [];
  for (const p of paths) {
    const { data: blob } = await admin.storage.from("history-imports").download(p);
    if (!blob) continue;
    if (blob.size > 8 * 1024 * 1024) continue; // 8MB cap per image
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const mime = blob.type || "image/png";
    imageParts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
  }
  if (!imageParts.length) return null;

  const systemPrompt = `You extract menstrual cycle data from screenshots of period-tracker apps (Clue, Flo, Apple Cycle Tracking, Natural Cycles, Stardust, etc.) or hand-written calendars. Read every visible date and return STRICT JSON only — no prose, no markdown.

Schema:
{
  "period_start_dates": ["YYYY-MM-DD", ...],   // first day of each period you can identify
  "symptom_logs": [
    { "date": "YYYY-MM-DD", "symptom": "cramps|bloating|headache|fatigue|mood swings|acne|breast tenderness|back pain|nausea|insomnia|anxiety|cravings|hot flashes|night sweats", "intensity": 1 }
  ]
}

Rules:
- Dates MUST be ISO YYYY-MM-DD. Infer the year from screenshot context (current year if unclear).
- Intensity 1=mild, 3=moderate, 5=severe. If unknown use 3.
- Only include symptoms you actually see marked.
- If you can't read a screenshot, return empty arrays.
- Output JSON only, nothing else.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract cycle and symptom data from these screenshots. Return JSON only." },
            ...imageParts,
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    console.error("vision API error", resp.status, await resp.text());
    return null;
  }
  const json = await resp.json();
  const raw: string = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: { period_start_dates?: string[]; symptom_logs?: { date: string; symptom: string; intensity?: number }[] };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  const cycleStarts: string[] = [];
  const symptomsByDay = new Map<string, Map<string, number>>();
  let earliest: string | null = null;
  let latest: string | null = null;
  const track = (d: string) => {
    if (!earliest || d < earliest) earliest = d;
    if (!latest || d > latest) latest = d;
  };

  for (const d of parsed.period_start_dates ?? []) {
    const day = parseDateOnly(d);
    if (!day) continue;
    cycleStarts.push(day);
    track(day);
  }
  for (const s of parsed.symptom_logs ?? []) {
    const day = parseDateOnly(s.date);
    if (!day || !s.symptom) continue;
    const intensity = Math.min(5, Math.max(1, Math.round(s.intensity ?? 3)));
    const map = symptomsByDay.get(day) ?? new Map<string, number>();
    map.set(s.symptom.toLowerCase(), Math.max(map.get(s.symptom.toLowerCase()) ?? 0, intensity));
    symptomsByDay.set(day, map);
    track(day);
  }
  cycleStarts.sort();
  return { cycleStarts: Array.from(new Set(cycleStarts)), symptomsByDay, earliest, latest };
}

// ---- Main ----
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email;

    const body = await req.json().catch(() => ({}));
    const storagePath: string = String(body.storage_path ?? "").trim();
    const sourceHint: string = String(body.source_hint ?? "csv").trim();
    const pastedText: string = typeof body.pasted_text === "string" ? body.pasted_text : "";
    const imagePaths: string[] = Array.isArray(body.image_paths)
      ? body.image_paths.filter((p: unknown) => typeof p === "string" && (p as string).startsWith(`${userId}/`)).slice(0, 6)
      : [];
    const mode: "paste" | "screenshot" | "file" = pastedText
      ? "paste"
      : imagePaths.length
      ? "screenshot"
      : "file";

    if (mode === "file" && (!storagePath || !storagePath.startsWith(`${userId}/`))) {
      return new Response(JSON.stringify({ error: "Invalid storage path" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mode === "paste" && pastedText.length > 500_000) {
      return new Response(JSON.stringify({ error: "Pasted text is too large (max ~500KB)." }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Rate limit: max 3 imports / 24h
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: recentCount } = await admin
      .from("history_imports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((recentCount ?? 0) >= MAX_PER_DAY) {
      return new Response(JSON.stringify({ error: "You've already imported 3 times in the last day. Try again tomorrow." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create import row
    const initialSource = mode === "paste" ? "pasted" : mode === "screenshot" ? "screenshot" : sourceHint;
    const { data: importRow, error: importErr } = await admin
      .from("history_imports")
      .insert({ user_id: userId, source: initialSource, status: "processing", storage_path: storagePath || (imagePaths[0] ?? null) })
      .select()
      .single();
    if (importErr) throw importErr;
    const importId = importRow.id;

    const finalize = async (patch: Record<string, unknown>) => {
      await admin.from("history_imports").update({
        ...patch,
        completed_at: new Date().toISOString(),
      }).eq("id", importId);
    };

    // Look up participant
    const { data: participant } = await admin
      .from("participants")
      .select("id")
      .eq("email", userEmail ?? "")
      .maybeSingle();

    let cycles: { start: string; end: string; length: number }[] = [];
    let symptomsByDay = new Map<string, Map<string, number>>();
    let sleepByDay = new Map<string, number>();
    let workoutsByDay = new Map<string, number>();
    let earliest: string | null = null;
    let latest: string | null = null;
    let detectedSource = initialSource;

    if (mode === "file") {
      // Download file
      const { data: fileBlob, error: dlErr } = await admin.storage.from("history-imports").download(storagePath);
      if (dlErr || !fileBlob) {
        await finalize({ status: "failed", error_message: "Download failed" });
        return new Response(JSON.stringify({ error: "Could not read uploaded file" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (fileBlob.size > MAX_BYTES) {
        await finalize({ status: "failed", error_message: "File too large" });
        return new Response(JSON.stringify({ error: "File is too large (max 60 MB). Try a shorter date range." }), {
          status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const lower = storagePath.toLowerCase();
      const isZip = lower.endsWith(".zip");
      const isXml = lower.endsWith(".xml");
      const isCsv = lower.endsWith(".csv");

      if (isZip || isXml) {
        detectedSource = "apple_health";
        let xml = "";
        if (isZip) {
          const reader = new ZipReader(new BlobReader(fileBlob));
          const entries = await reader.getEntries();
          const exportEntry = entries.find((e) => /export\.xml$/i.test(e.filename) && !e.filename.includes("export_cda"));
          if (!exportEntry?.getData) {
            await reader.close();
            await finalize({ status: "failed", error_message: "No export.xml in zip" });
            return new Response(JSON.stringify({ error: "Couldn't find export.xml inside the zip." }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          xml = await exportEntry.getData(new TextWriter());
          await reader.close();
        } else {
          xml = await fileBlob.text();
        }
        const parsed = parseAppleHealthXml(xml);
        cycles = periodDaysToCycles(parsed.periodDays);
        symptomsByDay = parsed.symptomsByDay;
        sleepByDay = parsed.sleepByDay;
        workoutsByDay = parsed.workoutsByDay;
        earliest = parsed.earliest;
        latest = parsed.latest;
      } else if (isCsv) {
        detectedSource = "csv";
        const text = await fileBlob.text();
        const parsed = parseGenericCsv(text);
        cycles = cycleStartsToCycles(parsed.cycleStarts);
        symptomsByDay = parsed.symptomsByDay;
        earliest = parsed.earliest;
        latest = parsed.latest;
      } else {
        await finalize({ status: "failed", error_message: "Unsupported file" });
        return new Response(JSON.stringify({ error: "Unsupported file type. Upload .zip, .xml, or .csv." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (mode === "paste") {
      detectedSource = "pasted";
      // Normalize tabs → commas so spreadsheet pastes work
      const normalized = pastedText.includes("\t") && !pastedText.includes(",")
        ? pastedText.replace(/\t/g, ",")
        : pastedText;
      const parsed = parseGenericCsv(normalized);
      cycles = cycleStartsToCycles(parsed.cycleStarts);
      symptomsByDay = parsed.symptomsByDay;
      earliest = parsed.earliest;
      latest = parsed.latest;
    } else {
      // screenshot mode — use Gemini vision
      detectedSource = "screenshot";
      const extracted = await extractFromScreenshots(admin, imagePaths);
      if (!extracted) {
        await finalize({ status: "failed", error_message: "Vision extraction failed" });
        return new Response(JSON.stringify({ error: "Couldn't read those screenshots. Try clearer images or fewer per upload." }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      cycles = cycleStartsToCycles(extracted.cycleStarts);
      symptomsByDay = extracted.symptomsByDay;
      earliest = extracted.earliest;
      latest = extracted.latest;
    }

    // ---- Insert cycles ----
    let cyclesImported = 0;
    if (participant && cycles.length) {
      // Pull existing starts to dedupe
      const { data: existing } = await admin
        .from("cycle_history")
        .select("cycle_start_date")
        .eq("participant_id", participant.id);
      const existingSet = new Set((existing ?? []).map((r) => r.cycle_start_date));
      const rows: CycleRow[] = cycles
        .filter((c) => !existingSet.has(c.start))
        .map((c) => ({
          participant_id: participant.id,
          cycle_start_date: c.start,
          cycle_end_date: c.end,
          cycle_length_days: c.length,
        }));
      if (rows.length) {
        const { error: insErr } = await admin.from("cycle_history").insert(rows);
        if (!insErr) cyclesImported = rows.length;
      }
    }

    // ---- Insert symptom logs (one row per day) ----
    let symptomDaysImported = 0;
    if (symptomsByDay.size) {
      const { data: existingSymp } = await admin
        .from("symptom_logs")
        .select("logged_at")
        .eq("user_id", userId)
        .gte("logged_at", (earliest ?? "1970-01-01") + "T00:00:00Z");
      const existingDays = new Set((existingSymp ?? []).map((r) => String(r.logged_at).slice(0, 10)));

      const rows: SymptomRow[] = [];
      for (const [day, syms] of symptomsByDay) {
        if (existingDays.has(day)) continue;
        const list = Array.from(syms.entries()).map(([name, intensity]) => ({ name, intensity }));
        if (!list.length) continue;
        rows.push({
          user_id: userId,
          symptoms: list,
          logged_at: day + "T12:00:00Z",
          notes: "Imported from " + detectedSource.replace("_", " "),
        });
      }
      // Chunk inserts to avoid huge payloads
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk);
        const { error } = await admin.from("symptom_logs").insert(slice);
        if (!error) symptomDaysImported += slice.length;
      }
    }

    // ---- Insert sleep + workout tracker logs ----
    let trackerLogsImported = 0;
    const ensureTracker = async (name: string, emoji: string): Promise<string | null> => {
      const { data: existing } = await admin
        .from("custom_trackers")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle();
      if (existing?.id) return existing.id;
      const { data: created } = await admin
        .from("custom_trackers")
        .insert({ user_id: userId, name, emoji, is_active: true })
        .select("id")
        .single();
      return created?.id ?? null;
    };

    const insertTrackerSeries = async (
      trackerName: string,
      emoji: string,
      byDay: Map<string, number>,
      toIntensity: (v: number) => number,
    ) => {
      if (!byDay.size) return;
      const trackerId = await ensureTracker(trackerName, emoji);
      if (!trackerId) return;
      const { data: existing } = await admin
        .from("tracker_logs")
        .select("logged_at")
        .eq("tracker_id", trackerId)
        .eq("user_id", userId);
      const existingDays = new Set((existing ?? []).map((r) => String(r.logged_at).slice(0, 10)));

      const rows: TrackerLogRow[] = [];
      for (const [day, val] of byDay) {
        if (existingDays.has(day)) continue;
        const intensity = Math.min(5, Math.max(1, toIntensity(val)));
        rows.push({
          user_id: userId,
          tracker_id: trackerId,
          intensity,
          logged_at: day + "T12:00:00Z",
          notes: trackerName === "Sleep" ? `${val.toFixed(1)} hours` : `${val} workout${val === 1 ? "" : "s"}`,
        });
      }
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk);
        const { error } = await admin.from("tracker_logs").insert(slice);
        if (!error) trackerLogsImported += slice.length;
      }
    };

    // 1-5 sleep score: <5h=1, 5-6=2, 6-7=3, 7-8=4, 8+=5
    await insertTrackerSeries("Sleep", "😴", sleepByDay, (h) =>
      h < 5 ? 1 : h < 6 ? 2 : h < 7 ? 3 : h < 8 ? 4 : 5
    );
    // 1-5 workout: count clamped
    await insertTrackerSeries("Workouts", "💪", workoutsByDay, (n) => Math.min(5, Math.max(1, Math.round(n))));

    const counts = {
      cycles: cyclesImported,
      symptom_days: symptomDaysImported,
      tracker_logs: trackerLogsImported,
    };

    await finalize({
      status: "completed",
      source: detectedSource,
      cycles_imported: cyclesImported,
      symptom_days_imported: symptomDaysImported,
      tracker_logs_imported: trackerLogsImported,
      date_range_start: earliest,
      date_range_end: latest,
    });

    // Compute recap stats for AI
    const avgLen = cycles.length
      ? Math.round((cycles.reduce((a, c) => a + c.length, 0) / cycles.length) * 10) / 10
      : null;

    // top symptoms overall
    const symptomTotals = new Map<string, number>();
    for (const [, syms] of symptomsByDay) {
      for (const [name, intensity] of syms) {
        symptomTotals.set(name, (symptomTotals.get(name) ?? 0) + intensity);
      }
    }
    const topSymptoms = Array.from(symptomTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n]) => n);

    const sleepAvg = sleepByDay.size
      ? Math.round((Array.from(sleepByDay.values()).reduce((a, b) => a + b, 0) / sleepByDay.size) * 10) / 10
      : null;

    // ---- Generate recap message ----
    const monthsSpan = earliest && latest
      ? Math.max(1, Math.round(dayDiff(earliest, latest) / 30))
      : null;

    const summaryFacts = [
      monthsSpan ? `${monthsSpan} months of history` : null,
      cyclesImported ? `${cyclesImported} cycles` : null,
      avgLen ? `avg cycle length ${avgLen} days` : null,
      symptomDaysImported ? `${symptomDaysImported} symptom days` : null,
      topSymptoms.length ? `top symptoms: ${topSymptoms.join(", ")}` : null,
      sleepAvg ? `avg sleep ${sleepAvg}h` : null,
      counts.tracker_logs ? `${counts.tracker_logs} tracker entries` : null,
    ].filter(Boolean).join(" · ");

    let recapText = `I just went through your history (${summaryFacts}). I'll use this to make every prediction smarter from here on.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY && summaryFacts) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are Logan, a knowledgeable, grounded presence guiding women's health. Logan has no gender — never use 'she/he/her/him' for yourself. Reply in 2-4 short sentences max. NEVER use bullet points, lists, headers, or emojis. Be warm but direct. Grace over guilt.",
              },
              {
                role: "user",
                content:
                  `I just imported the user's historical health data. Write a chat message acknowledging what you learned and one specific pattern you'll watch for. Facts: ${summaryFacts}.`,
              },
            ],
          }),
        });
        if (aiResp.ok) {
          const ai = await aiResp.json();
          const content = ai.choices?.[0]?.message?.content;
          if (content) recapText = content.trim();
        }
      } catch (e) {
        console.error("recap AI error", e);
      }
    }

    // Insert recap into chat
    await admin.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: recapText,
      message_type: "text",
      metadata: { source: "history_import", import_id: importId, counts },
    });

    // Best-effort cleanup of uploaded file
    const toRemove = mode === "screenshot" ? imagePaths : storagePath ? [storagePath] : [];
    if (toRemove.length) admin.storage.from("history-imports").remove(toRemove).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        import_id: importId,
        source: detectedSource,
        counts,
        date_range: { start: earliest, end: latest },
        recap: recapText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("import-history error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
