import { supabase } from "@/integrations/supabase/client";
import { fetchEligibleUserIds } from "@/lib/metrics/definitions";
import { SESSION_GAP_MS, isUserInitiatedEvent, utcKey, toUTCDate } from "@/lib/activeUsers";

/**
 * SINGLE SOURCE OF TRUTH for "which life stage is this user in right now",
 * used by the admin Overview "Engagement by life stage" table.
 *
 * Life stage is not stored in one column — it is spread across
 * `participants`:
 *   life_stage                  ('cycling' | 'irregular' | 'pregnant' |
 *                                'postpartum' | 'pregnancy_loss' |
 *                                'perimenopause' | 'menopause')
 *   postpartum_start_date       (birth date)
 *   postpartum_active           (dual postpartum+cycling flag)
 *   is_breastfeeding / feeding_status   (nursing signals)
 *   due_date / pregnancy_lmp    (pregnancy dates)
 *   on_hormonal_bc              (boolean, set by chat/onboarding BC detection)
 *   birth_control_status        ('none' | 'hormonal' | 'non_hormonal')
 *   cycle_regularity            ('regular' | ...)
 *
 * NOTE: nothing in the schema distinguishes an IUD from a pill, nor a
 * continuous pill from a cyclic one — hormonal BC is a single bucket.
 *
 * READ ONLY: this module never writes life stage anywhere.
 */

export type LifeStageKey =
  | "pregnant"
  | "postpartum"
  | "bc_iud"
  | "bc_hormonal"
  | "irregular"
  | "menopausal"
  | "regular"
  | "not_set";

export const LIFE_STAGE_ORDER: LifeStageKey[] = [
  "pregnant", "postpartum", "bc_iud", "bc_hormonal",
  "irregular", "menopausal", "regular", "not_set",
];

export const LIFE_STAGE_LABELS: Record<LifeStageKey, string> = {
  pregnant: "Pregnant",
  postpartum: "Postpartum",
  bc_iud: "Birth control: IUD",
  bc_hormonal: "Birth control: pill / other hormonal",
  irregular: "Irregular / PCOS",
  menopausal: "Perimenopause / menopause",
  regular: "Regular cycle",
  not_set: "Not set",
};

export interface ParticipantStageRow {
  user_id: string | null;
  life_stage: string | null;
  postpartum_start_date: string | null;
  postpartum_active: boolean | null;
  is_breastfeeding: boolean | null;
  feeding_status: string | null;
  due_date: string | null;
  pregnancy_lmp: string | null;
  on_hormonal_bc: boolean | null;
  birth_control_status: string | null;
  cycle_regularity: string | null;
  last_period_start: string | null;
}

export interface StageResolution {
  stage: LifeStageKey;
  /** More than one independent stage signal present (precedence decided). */
  conflicting: boolean;
}

/** Precedence: pregnant > postpartum > IUD > hormonal BC > irregular > meno > regular. */
export const resolveLifeStage = (p?: ParticipantStageRow | null): StageResolution => {
  if (!p) return { stage: "not_set", conflicting: false };

  const ls = (p.life_stage ?? "").trim();
  const bcStatus = (p.birth_control_status ?? "").trim();
  const feeding = (p.feeding_status ?? "").trim();

  const pregnant = ls === "pregnant" || !!p.due_date || !!p.pregnancy_lmp;
  const postpartum =
    ls === "postpartum" ||
    p.postpartum_active === true ||
    !!p.postpartum_start_date ||
    p.is_breastfeeding === true ||
    (feeding !== "" && feeding !== "weaned");
  // Nothing in the schema records the BC device, so IUD can never be
  // separated from pill/other hormonal — kept as its own bucket so the row
  // exists (and reads 0) rather than silently folding into hormonal.
  const iud = false;
  const hormonalBc = p.on_hormonal_bc === true || bcStatus === "hormonal";
  const irregular = ls === "irregular";
  const menopausal = ls === "perimenopause" || ls === "menopause";
  const regular = ls === "cycling" || (ls === "" && !!p.last_period_start);

  const signals = [pregnant, postpartum, iud, hormonalBc, irregular, menopausal, regular]
    .filter(Boolean).length;
  const conflicting = signals > 1;

  let stage: LifeStageKey = "not_set";
  if (pregnant) stage = "pregnant";
  else if (postpartum) stage = "postpartum";
  else if (iud) stage = "bc_iud";
  else if (hormonalBc) stage = "bc_hormonal";
  else if (irregular) stage = "irregular";
  else if (menopausal) stage = "menopausal";
  else if (regular) stage = "regular";

  return { stage, conflicting };
};

export interface StageMetrics {
  stage: LifeStageKey | "all";
  label: string;
  users: number;
  pctActive7: number | null;
  pctActive30: number | null;
  /** % of users onboarded >= 28 days ago active on days 22-28 after onboarding. */
  retentionW4: number | null;
  retentionW4Base: number;
  avgMinutesPerActiveUserDay: number | null;
  avgSessionsPerActiveUserWeek: number | null;
}

export interface LifeStageEngagement {
  rows: StageMetrics[];
  conflictingUsers: number;
}

const DAY = 86400000;
const PAGE = 1000;

const fetchAllRows = async <T,>(
  build: (from: number, to: number) => any,
): Promise<T[]> => {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
};

/**
 * Loads every metric for the "Engagement by life stage" table. Uses the shared
 * eligibility definition (onboarded, non-internal) and the shared session
 * reconstruction (user-initiated events only, 30-minute inactivity gap).
 * Throws on any failure — the caller renders the retry state.
 */
export const fetchLifeStageEngagement = async (): Promise<LifeStageEngagement> => {
  const eligible = await fetchEligibleUserIds();

  const [participants, onboardingMsgs] = await Promise.all([
    fetchAllRows<ParticipantStageRow>((from, to) =>
      supabase.from("participants")
        .select("user_id, life_stage, postpartum_start_date, postpartum_active, is_breastfeeding, feeding_status, due_date, pregnancy_lmp, on_hormonal_bc, birth_control_status, cycle_regularity, last_period_start")
        .order("updated_at", { ascending: true })
        .range(from, to)),
    fetchAllRows<{ user_id: string; created_at: string }>((from, to) =>
      supabase.from("chat_messages")
        .select("user_id, created_at")
        .eq("metadata->>onboarding_complete", "true")
        .order("created_at", { ascending: true })
        .range(from, to)),
  ]);

  const byUser = new Map<string, ParticipantStageRow>();
  for (const p of participants) {
    if (p.user_id && eligible.has(p.user_id)) byUser.set(p.user_id, p);
  }

  const onboardedAt = new Map<string, number>();
  for (const m of onboardingMsgs) {
    if (!eligible.has(m.user_id)) continue;
    const ts = new Date(m.created_at).getTime();
    const prev = onboardedAt.get(m.user_id);
    if (prev === undefined || ts < prev) onboardedAt.set(m.user_id, ts);
  }

  // --- stage per eligible user
  const stageOf = new Map<string, LifeStageKey>();
  let conflictingUsers = 0;
  for (const userId of eligible) {
    const res = resolveLifeStage(byUser.get(userId));
    stageOf.set(userId, res.stage);
    if (res.conflicting) conflictingUsers++;
  }

  // --- activity: full history (retention) + last 30 days (time/sessions)
  const earliestOnboard = Math.min(...[...onboardedAt.values(), Date.now()]);
  const sinceIso = new Date(Math.min(earliestOnboard, Date.now() - 31 * DAY)).toISOString();

  const [chat, events, symptoms] = await Promise.all([
    fetchAllRows<{ user_id: string; created_at: string }>((from, to) =>
      supabase.from("chat_messages").select("user_id, created_at")
        .eq("role", "user").gte("created_at", sinceIso)
        .order("created_at", { ascending: true }).range(from, to)),
    fetchAllRows<{ user_id: string; event_type: string; created_at: string }>((from, to) =>
      supabase.from("user_activity_events").select("user_id, event_type, created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true }).range(from, to)),
    fetchAllRows<{ user_id: string; created_at: string }>((from, to) =>
      supabase.from("symptom_logs").select("user_id, created_at:logged_at")
        .gte("logged_at", sinceIso)
        .order("logged_at", { ascending: true }).range(from, to)),
  ]);

  const activeDays = new Map<string, Set<string>>();   // user -> UTC day keys
  const tsByUserDay = new Map<string, Map<string, number[]>>(); // last 30d only
  const todayKey = utcKey(new Date());
  const windowStart30 = utcKey(new Date(Date.now() - 29 * DAY));
  const windowStart7 = utcKey(new Date(Date.now() - 6 * DAY));

  const mark = (userId: string, iso: string) => {
    if (!userId || !eligible.has(userId) || !iso) return;
    const ts = new Date(iso).getTime();
    const key = utcKey(new Date(ts));
    let set = activeDays.get(userId);
    if (!set) { set = new Set(); activeDays.set(userId, set); }
    set.add(key);
    if (key >= windowStart30 && key <= todayKey) {
      let byDay = tsByUserDay.get(userId);
      if (!byDay) { byDay = new Map(); tsByUserDay.set(userId, byDay); }
      const arr = byDay.get(key) ?? [];
      arr.push(ts);
      byDay.set(key, arr);
    }
  };

  for (const m of chat) mark(m.user_id, m.created_at);
  for (const s of symptoms) mark(s.user_id, s.created_at);
  for (const e of events) {
    if (!isUserInitiatedEvent(e.event_type)) continue;
    mark(e.user_id, e.created_at);
  }

  // --- per-user derived figures
  interface UserAgg {
    active7: boolean;
    active30: boolean;
    activeDayCount30: number;
    minutes30: number;
    sessions30: number;
    retentionEligible: boolean;
    retained: boolean;
  }
  const agg = new Map<string, UserAgg>();
  for (const userId of eligible) {
    const days = activeDays.get(userId) ?? new Set<string>();
    let active7 = false, active30 = false;
    for (const k of days) {
      if (k >= windowStart30 && k <= todayKey) active30 = true;
      if (k >= windowStart7 && k <= todayKey) active7 = true;
    }

    let minutes30 = 0, sessions30 = 0, activeDayCount30 = 0;
    const byDay = tsByUserDay.get(userId);
    if (byDay) {
      for (const times of byDay.values()) {
        if (times.length === 0) continue;
        activeDayCount30++;
        times.sort((a, b) => a - b);
        let start = times[0];
        let end = times[0];
        sessions30 = sessions30 + 1;
        for (let i = 1; i < times.length; i++) {
          if (times[i] - times[i - 1] > SESSION_GAP_MS) {
            minutes30 += Math.max(1, Math.round((end - start) / 60000));
            sessions30++;
            start = times[i];
          }
          end = times[i];
        }
        minutes30 += Math.max(1, Math.round((end - start) / 60000));
      }
    }

    const onb = onboardedAt.get(userId);
    let retentionEligible = false, retained = false;
    if (onb !== undefined && Date.now() - onb >= 28 * DAY) {
      retentionEligible = true;
      const winStart = utcKey(new Date(onb + 22 * DAY));
      const winEnd = utcKey(new Date(onb + 28 * DAY));
      for (const k of days) {
        if (k >= winStart && k <= winEnd) { retained = true; break; }
      }
    }

    agg.set(userId, { active7, active30, activeDayCount30, minutes30, sessions30, retentionEligible, retained });
  }

  const pct = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;
  const avg = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 10) / 10 : null;

  const buildRow = (stage: LifeStageKey | "all", ids: string[]): StageMetrics => {
    let a7 = 0, a30 = 0, dayCount = 0, minutes = 0, sessions = 0, retBase = 0, retained = 0;
    for (const id of ids) {
      const a = agg.get(id);
      if (!a) continue;
      if (a.active7) a7++;
      if (a.active30) a30++;
      dayCount += a.activeDayCount30;
      minutes += a.minutes30;
      sessions += a.sessions30;
      if (a.retentionEligible) { retBase++; if (a.retained) retained++; }
    }
    return {
      stage,
      label: stage === "all" ? "All users" : LIFE_STAGE_LABELS[stage],
      users: ids.length,
      pctActive7: pct(a7, ids.length),
      pctActive30: pct(a30, ids.length),
      retentionW4: pct(retained, retBase),
      retentionW4Base: retBase,
      avgMinutesPerActiveUserDay: avg(minutes, dayCount),
      // sessions over 30 days, per active user, expressed per week
      avgSessionsPerActiveUserWeek: a30 > 0 ? Math.round((sessions / a30 / (30 / 7)) * 10) / 10 : null,
    };
  };

  const idsByStage = new Map<LifeStageKey, string[]>();
  for (const s of LIFE_STAGE_ORDER) idsByStage.set(s, []);
  for (const [userId, stage] of stageOf) idsByStage.get(stage)!.push(userId);

  const rows = LIFE_STAGE_ORDER.map((s) => buildRow(s, idsByStage.get(s)!));
  rows.push(buildRow("all", [...eligible]));

  return { rows, conflictingUsers };
};

export { toUTCDate };
