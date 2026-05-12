// Whoop OAuth callback: exchange code, store tokens, redirect back to app
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const WHOOP_TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const APP_URL = "https://asklogan.ai";

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function redirect(status: "ok" | "error", message?: string) {
  const url = new URL(`${APP_URL}/integrations/whoop/callback`);
  url.searchParams.set("status", status);
  if (message) url.searchParams.set("message", message);
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLIENT_ID = Deno.env.get("WHOOP_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("WHOOP_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) return redirect("error", "Server not configured");

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errParam = url.searchParams.get("error");

    if (errParam) return redirect("error", errParam);
    if (!code || !state) return redirect("error", "Missing code or state");

    // Validate state
    const [b64, sig] = state.split(".");
    if (!b64 || !sig) return redirect("error", "Invalid state");
    const payload = atob(b64);
    const expectedSig = await hmac(SERVICE_KEY, payload);
    if (sig !== expectedSig) return redirect("error", "State signature mismatch");
    const [userId, expiryStr] = payload.split(".");
    if (!userId || !expiryStr || Date.now() > Number(expiryStr)) {
      return redirect("error", "State expired");
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/oauth-whoop-callback`;

    const tokenRes = await fetch(WHOOP_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("Whoop token exchange failed", tokenRes.status, t);
      return redirect("error", `Token exchange failed (${tokenRes.status})`);
    }
    const tok = await tokenRes.json();
    // tok: { access_token, refresh_token, expires_in, scope, token_type }

    const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();

    // Fetch profile to get whoop user id (best-effort)
    let providerUserId: string | null = null;
    try {
      const pr = await fetch("https://api.prod.whoop.com/developer/v1/user/profile/basic", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      if (pr.ok) {
        const profile = await pr.json();
        providerUserId = String(profile.user_id ?? profile.id ?? "");
      }
    } catch (_) { /* ignore */ }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error: upsertErr } = await admin
      .from("user_integrations")
      .upsert({
        user_id: userId,
        provider: "whoop",
        provider_user_id: providerUserId,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token ?? null,
        expires_at: expiresAt,
        scopes: tok.scope ?? null,
        status: "active",
        connected_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });

    if (upsertErr) {
      console.error("Upsert failed", upsertErr);
      return redirect("error", "Could not save connection");
    }

    // Send Logan's welcome brief
    try {
      await admin.from("chat_messages").insert({
        user_id: userId,
        role: "assistant",
        content: "Your Whoop is connected. I'm pulling your last 30 days of recovery, sleep, and strain data so my guidance can adapt to how your body actually responds.",
        message_type: "text",
        metadata: { source: "whoop_welcome" },
      });
    } catch (msgErr) {
      console.error("Welcome message insert failed", msgErr);
    }

    // Kick off initial sync (fire and forget)
    fetch(`${SUPABASE_URL}/functions/v1/sync-whoop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ user_id: userId, backfill_days: 30 }),
    }).catch((e) => console.error("Initial sync trigger failed", e));

    return redirect("ok");
  } catch (e) {
    console.error("Callback error", e);
    return redirect("error", e instanceof Error ? e.message : "Unknown error");
  }
});
