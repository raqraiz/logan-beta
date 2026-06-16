// Adds (or updates) a contact in Brevo via the Lovable connector gateway.
// Optionally adds the contact to a Brevo list when BREVO_LIST_ID is configured.
// Trigger Brevo automations off the SOURCE attribute or list membership.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/brevo';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

  if (!LOVABLE_API_KEY || !BREVO_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Brevo connector is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawSource = typeof body?.source === 'string' ? body.source : 'landing_waitlist';
    const ALLOWED_SOURCES = new Set([
      'landing_hero',
      'landing_waitlist',
      'trial_chat',
      'signup',
    ]);
    const source = ALLOWED_SOURCES.has(rawSource) ? rawSource : 'landing_waitlist';

    // Allowlist of attribute keys we forward to Brevo. Reject everything else
    // to prevent unauthenticated callers from overriding arbitrary contact fields.
    const ALLOWED_ATTR_KEYS = ['FIRSTNAME', 'LASTNAME', 'NAME'] as const;
    const safeAttributes: Record<string, unknown> = {};
    if (body?.attributes && typeof body.attributes === 'object') {
      for (const key of ALLOWED_ATTR_KEYS) {
        const val = (body.attributes as Record<string, unknown>)[key];
        if (typeof val === 'string' && val.length > 0 && val.length <= 200) {
          safeAttributes[key] = val;
        }
      }
    }

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const listIdRaw = Deno.env.get('BREVO_LIST_ID');
    const listIds = listIdRaw ? [Number(listIdRaw)].filter((n) => !Number.isNaN(n)) : undefined;

    const payload: Record<string, unknown> = {
      email,
      attributes: { SOURCE: source, ...safeAttributes },
      updateEnabled: true,
    };

    if (listIds && listIds.length) payload.listIds = listIds;

    const res = await fetch(`${GATEWAY_URL}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    // Brevo returns 201 on create, 204 on update.
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      console.error('Brevo contacts error', { status: res.status, body: text });
      return new Response(
        JSON.stringify({ error: 'Failed to add contact', status: res.status, detail: text }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('brevo-add-contact error', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
