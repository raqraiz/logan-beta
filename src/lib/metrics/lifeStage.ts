import { supabase } from "@/integrations/supabase/client";
import { fetchLifeStageActivity, type LifeStageActivity } from "@/lib/adminActivity";
import { fetchEligibleUserIds } from "@/lib/metrics/definitions";
import { toUTCDate } from "@/lib/activeUsers";

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
 * eligibility definition (onboarded, non-internal); activity totals come from the
 * server (user-initiated events only, 30-minute inactivity gap).
 * Throws on any failure — the caller renders the retry state.
 */
export const fetchLifeStageEngagement = async (): Promise<LifeStageEngagement> => {
  const eligible = await fetchEligibleUserIds();

  const participants = await fetchAllRows<ParticipantStageRow>((from, to) =>
    supabase.from("participants")
      .select("user_id, life_stage, postpartum_start_date, postpartum_active, is_breastfeeding, feeding_status, due_date, pregnancy_lmp, on_hormonal_bc, birth_control_status, cycle_regularity, last_period_start")
      .order("updated_at", { ascending: true })
      .range(from, to));

  const byUser = new Map<string, ParticipantStageRow>();
  for (const p of participants) {
    if (p.user_id && eligible.has(p.user_id)) byUser.set(p.user_id, p);
  }

  // --- stage per eligible user
  const stageOf = new Map<string, LifeStageKey>();
  let conflictingUsers = 0;
  for (const userId of eligible) {
    const res = resolveLifeStage(byUser.get(userId));
    stageOf.set(userId, res.stage);
    if (res.conflicting) conflictingUsers++;
  }

  // --- activity totals per stage, computed on the server from ALL user-initiated
  // sources (chat messages she sent, symptom logs, activity events). Only the
  // stage -> ids mapping goes up; only counts come back.
  const idsByStage = new Map<LifeStageKey, string[]>();
  for (const s of LIFE_STAGE_ORDER) idsByStage.set(s, []);
  for (const [userId, stage] of stageOf) idsByStage.get(stage)!.push(userId);

  const activity = await fetchLifeStageActivity(
    Object.fromEntries(LIFE_STAGE_ORDER.map((s) => [s, idsByStage.get(s)!])),
  );
  const byStage = new Map(activity.map((a) => [a.grp, a]));

  const pct = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;
  const avg = (num: number, den: number): number | null =>
    den > 0 ? Math.round((num / den) * 10) / 10 : null;

  const ZERO: LifeStageActivity = {
    grp: "", active7: 0, active30: 0, activeDays30: 0, minutes30: 0, sessions30: 0, retentionBase: 0, retained: 0,
  };
  const buildRow = (stage: LifeStageKey | "all", users: number, a: LifeStageActivity): StageMetrics => ({
    stage,
    label: stage === "all" ? "All users" : LIFE_STAGE_LABELS[stage],
    users,
    pctActive7: pct(a.active7, users),
    pctActive30: pct(a.active30, users),
    retentionW4: pct(a.retained, a.retentionBase),
    retentionW4Base: a.retentionBase,
    avgMinutesPerActiveUserDay: avg(a.minutes30, a.activeDays30),
    // sessions over 30 days, per active user, expressed per week
    avgSessionsPerActiveUserWeek: a.active30 > 0 ? Math.round((a.sessions30 / a.active30 / (30 / 7)) * 10) / 10 : null,
  });

  const rows = LIFE_STAGE_ORDER.map((s) => buildRow(s, idsByStage.get(s)!.length, byStage.get(s) ?? ZERO));
  // Every eligible person sits in exactly one stage, so "all" is the sum of the stages.
  const total = LIFE_STAGE_ORDER.reduce<LifeStageActivity>((t, s) => {
    const a = byStage.get(s) ?? ZERO;
    return {
      grp: "all", active7: t.active7 + a.active7, active30: t.active30 + a.active30,
      activeDays30: t.activeDays30 + a.activeDays30, minutes30: t.minutes30 + a.minutes30,
      sessions30: t.sessions30 + a.sessions30, retentionBase: t.retentionBase + a.retentionBase,
      retained: t.retained + a.retained,
    };
  }, ZERO);
  rows.push(buildRow("all", eligible.size, total));

  return { rows, conflictingUsers };
};

export { toUTCDate };
