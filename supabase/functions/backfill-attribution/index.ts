// Backfills the authenticated user's profile with UTM/referrer attribution.
// First-touch semantics: only fills fields that are currently NULL on the
// profile — never overwrites attribution that's already been recorded.
//
// Sources, in priority order:
//   1. Inline attribution from the request body (current localStorage state).
//   2. Earliest attribution_event for the caller's anon_id that has any UTM.
//   3. Earliest attribution_event for the caller's anon_id (referrer fallback).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface InlineAttribution {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  landing_path?: string | null;
  landing_at?: string | null;
  ref_code?: string | null;
}

interface RequestBody {
  anon_id?: string;
  attribution?: InlineAttribution;
}

const ATTR_FIELDS = [
  "utm_source", "utm_medium", "utm_campaign",
  "utm_term", "utm_content", "referrer", "landing_path",
] as const;

const truncate = (v: unknown, max = 512): string | null => {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const sanitizeInline = (a: InlineAttribution | undefined): Partial<Record<typeof ATTR_FIELDS[number], string | null>> => {
  if (!a || typeof a !== "object") return {};
  const out: Record<string, string | null> = {};
  for (const f of ATTR_FIELDS) {
    out[f] = truncate(a[f]);
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const _ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Validate JWT — require an authenticated user.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice(7).trim();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const user = userData.user;

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    // Empty body is fine — we'll still try to match via any prior events.
  }


  // 1. Load the current profile.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, referred_by, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_path, landing_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!profile) {
    // Profile not yet created; nothing to backfill.
    return new Response(JSON.stringify({ status: "no_profile" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const missing = ATTR_FIELDS.filter((f) => !profile[f]);
  const needsReferral = !profile.referred_by;
  if (missing.length === 0 && !needsReferral) {
    return new Response(JSON.stringify({ status: "already_filled" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Gather candidate sources.
  const paths: string[] = [];
  const candidates: Array<Partial<Record<typeof ATTR_FIELDS[number], string | null>> & { landing_at?: string | null }> = [];

  // Inline candidate from the request body.
  const inline = sanitizeInline(body.attribution);
  if (Object.values(inline).some((v) => v)) {
    candidates.push({ ...inline, landing_at: truncate(body.attribution?.landing_at, 64) });
    paths.push("inline_match");
  }

  // anon_id candidates — also link events to this user for future analysis.
  if (isUuid(body.anon_id)) {
    // Link any unlinked events for this anon_id to the user.
    await admin
      .from("attribution_events")
      .update({ user_id: user.id })
      .eq("anon_id", body.anon_id)
      .is("user_id", null);

    // Prefer earliest event that actually has a UTM, then fall back to
    // earliest event with any referrer.
    const { data: utmEvent } = await admin
      .from("attribution_events")
      .select("utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_path, captured_at")
      .eq("anon_id", body.anon_id)
      .not("utm_source", "is", null)
      .order("captured_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (utmEvent) candidates.push({ ...utmEvent, landing_at: utmEvent.captured_at });

    const { data: anyEvent } = await admin
      .from("attribution_events")
      .select("utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_path, captured_at")
      .eq("anon_id", body.anon_id)
      .order("captured_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (anyEvent) candidates.push({ ...anyEvent, landing_at: anyEvent.captured_at });

    if (utmEvent || anyEvent) paths.push("anon_id_match");
  }

  // 3. Resolve referral code → referred_by (first one wins, can't self-refer).
  const patch: Record<string, string | null> = {};
  if (needsReferral) {
    const refCandidates: string[] = [];
    const inlineRef = typeof body.attribution?.ref_code === "string" ? body.attribution.ref_code.trim().toUpperCase() : "";
    if (inlineRef) refCandidates.push(inlineRef);

    if (isUuid(body.anon_id)) {
      const { data: refEvent } = await admin
        .from("attribution_events")
        .select("ref_code, captured_at")
        .eq("anon_id", body.anon_id)
        .not("ref_code", "is", null)
        .order("captured_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (refEvent?.ref_code) refCandidates.push(String(refEvent.ref_code).toUpperCase());
    }

    for (const code of refCandidates) {
      const { data: referrer } = await admin
        .from("profiles")
        .select("id")
        .eq("referral_code", code)
        .maybeSingle();
      if (referrer?.id && referrer.id !== user.id) {
        patch.referred_by = referrer.id;
        break;
      }
    }
  }

  // 3b. Time-window fallback: no anon_id, no inline attribution, nothing resolved.
  // If exactly ONE unlinked attribution_event was captured in the 2 minutes
  // before this signup, treat it as this user's click. Never guess on 0 or 2+.
  if (candidates.length === 0 && Object.keys(patch).length === 0) {
    const signupAt = user.created_at ? new Date(user.created_at) : new Date();
    const windowStart = new Date(signupAt.getTime() - 2 * 60 * 1000).toISOString();
    // Small forward tolerance for clock skew between capture and signup rows.
    const windowEnd = new Date(signupAt.getTime() + 60 * 1000).toISOString();

    const { data: windowEvents } = await admin
      .from("attribution_events")
      .select("id, anon_id, ref_code, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_path, captured_at, created_at")
      .is("user_id", null)
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: true })
      .limit(3);

    // Distinct anon_ids only — repeated pings from the same browser are one click.
    const distinctAnonIds = Array.from(new Set((windowEvents ?? []).map((e: any) => e.anon_id)));

    if (distinctAnonIds.length === 1 && windowEvents && windowEvents.length > 0) {
      const match: any = windowEvents[0];

      await admin
        .from("attribution_events")
        .update({ user_id: user.id })
        .eq("anon_id", match.anon_id)
        .is("user_id", null);

      candidates.push({
        utm_source: match.utm_source,
        utm_medium: match.utm_medium,
        utm_campaign: match.utm_campaign,
        utm_term: match.utm_term,
        utm_content: match.utm_content,
        referrer: match.referrer,
        landing_path: match.landing_path,
        landing_at: match.captured_at ?? match.created_at,
      });
      paths.push("time_window_fallback");

      if (needsReferral) {
        const code = (windowEvents.find((e: any) => e.ref_code)?.ref_code ?? "").toString().trim().toUpperCase();
        if (code) {
          const { data: referrer } = await admin
            .from("profiles")
            .select("id")
            .eq("referral_code", code)
            .maybeSingle();
          if (referrer?.id && referrer.id !== user.id) patch.referred_by = referrer.id;
        }
      }

      console.log(JSON.stringify({
        fn: "backfill-attribution",
        path: "time_window_fallback",
        user_id: user.id,
        matched_anon_id: match.anon_id,
        events_in_window: windowEvents.length,
        referred_by: patch.referred_by ?? null,
      }));
    } else {
      console.log(JSON.stringify({
        fn: "backfill-attribution",
        path: "time_window_fallback_skipped",
        user_id: user.id,
        distinct_anon_ids: distinctAnonIds.length,
        reason: distinctAnonIds.length === 0 ? "no_events_in_window" : "ambiguous_multiple_anon_ids",
      }));
    }
  }

  if (candidates.length === 0 && Object.keys(patch).length === 0) {
    console.log(JSON.stringify({ fn: "backfill-attribution", path: "no_candidates", user_id: user.id, missing }));
    return new Response(JSON.stringify({ status: "no_candidates", missing }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  // 4. Build UTM patch: only fill currently-null fields, walking candidates in order.
  for (const field of missing) {
    for (const c of candidates) {
      const v = (c as any)[field];
      if (v) { patch[field] = v; break; }
    }
  }

  // Best-effort landing_at if still missing.
  if (!profile.landing_at) {
    for (const c of candidates) {
      if (c.landing_at) { patch.landing_at = c.landing_at; break; }
    }
  }

  if (Object.keys(patch).length === 0) {
    return new Response(JSON.stringify({ status: "no_new_fields", missing }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", user.id);

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(JSON.stringify({
    fn: "backfill-attribution",
    path: paths.length ? paths.join("+") : "referral_only",
    user_id: user.id,
    fields: Object.keys(patch),
  }));

  return new Response(JSON.stringify({ status: "backfilled", path: paths.join("+") || "referral_only", fields: Object.keys(patch) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
