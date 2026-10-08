import { call } from "@/lib/adminActivity";

/** Referrals screen data. Roles are checked in the database functions; admins never receive a user ID. */
type Row = Record<string, unknown>;
const n = (v: unknown): number => Number(v) || 0;
const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export type ReferralPeriod = "month" | "all";
export interface ReferralSummary { signups: number; activeBase: number; active: number; referrers: number }
export interface ReferrerRow {
  refKey: string; firstName: string | null; lastInitial: string | null; userId: string | null;
  signups: number; allTime: number; activeBase: number; active: number; lastReferral: string; thankedAt: string | null;
}

export const fetchReferralSummary = async (period: ReferralPeriod): Promise<ReferralSummary> => {
  const r = ((await call<Row[]>("admin_referrals_summary", { _period: period })) ?? [])[0];
  return { signups: n(r?.signups), activeBase: n(r?.active_base), active: n(r?.active), referrers: n(r?.referrers) };
};

export const fetchReferrers = async (period: ReferralPeriod): Promise<ReferrerRow[]> =>
  ((await call<Row[]>("admin_referrals_list", { _period: period })) ?? []).map((r) => ({
    refKey: String(r.ref_key), firstName: s(r.first_name), lastInitial: s(r.last_initial), userId: s(r.user_id),
    signups: n(r.signups), allTime: n(r.all_time), activeBase: n(r.active_base), active: n(r.active),
    lastReferral: String(r.last_referral), thankedAt: s(r.thanked_at),
  }));

/** Returns "sent" (super admin) or "waiting" (admin: a super admin approves it first). */
export const sendThankYou = (refKey: string, body: string) =>
  call<"sent" | "waiting">("admin_referral_thank_you", { _ref_key: refKey, _body: body });

/** Share of referred women past their first 14 days who were active again within them. Null until anyone is past day 14. */
export const activePercent = (active: number, base: number): number | null => (base > 0 ? Math.round((active / base) * 100) : null);

/** No em dashes anywhere in the starter. */
export const thankYouStarter = (firstName: string | null, total: number): string =>
  `${firstName ? `Hi ${firstName}, ` : "Hi, "}thank you for sharing Logan! ${total} ${total === 1 ? "woman" : "women"} joined through you.`;
