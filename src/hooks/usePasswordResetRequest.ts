import { useCallback, useEffect, useState } from "react";
import { requestPasswordReset, RESET_RESEND_SECONDS } from "@/lib/passwordReset";

/**
 * Shared "send me a reset link" behaviour: sending state, a resend countdown,
 * and friendly (never raw) error messages.
 */
export const usePasswordResetRequest = () => {
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = useCallback(
    async (email: string) => {
      if (isSending || cooldown > 0) return;
      setIsSending(true);
      setError(null);
      try {
        const result = await requestPasswordReset(email);
        if (result.ok) {
          setSent(true);
          setCooldown(RESET_RESEND_SECONDS);
        } else if (result.kind === "rate_limited") {
          setCooldown(result.seconds ?? RESET_RESEND_SECONDS);
          setError(
            "We've already sent a link to this address. Check your inbox and spam folder, or try again when the timer ends."
          );
        } else {
          setError("We couldn't send the email just now. Please try again in a moment.");
        }
      } catch {
        setError("We couldn't send the email just now. Please try again in a moment.");
      } finally {
        setIsSending(false);
      }
    },
    [isSending, cooldown]
  );

  const reset = useCallback(() => {
    setSent(false);
    setError(null);
    setCooldown(0);
  }, []);

  return { send, reset, isSending, sent, error, cooldown };
};
