import { supabase } from "@/integrations/supabase/client";

// Same minimum the sign-up forms enforce, so existing accounts are unaffected.
export const MIN_PASSWORD_LENGTH = 6;
export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;

// Supabase allows one reset email per address roughly every 60 seconds.
export const RESET_RESEND_SECONDS = 60;

export interface ResetRequestResult {
  ok: boolean;
  kind?: "rate_limited" | "error";
  seconds?: number;
}

const secondsFromRateLimit = (message: string): number => {
  const match = message.match(/(\d+)\s*second/i);
  const parsed = match ? parseInt(match[1], 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : RESET_RESEND_SECONDS;
};

/** Sends the reset email. Never exposes raw error text to the caller. */
export const requestPasswordReset = async (email: string): Promise<ResetRequestResult> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (!error) return { ok: true };

  const rateLimited =
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    /only request this after|rate limit/i.test(error.message);
  if (rateLimited) {
    return { ok: false, kind: "rate_limited", seconds: secondsFromRateLimit(error.message) };
  }
  return { ok: false, kind: "error" };
};
