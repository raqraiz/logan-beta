import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Users created between 72h and 96h ago (1-hour cron with 24h window for safety).
    const now = Date.now()
    const windowStart = new Date(now - 96 * 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(now - 72 * 60 * 60 * 1000).toISOString()

    // List users. auth admin listUsers is paginated; iterate.
    let page = 1
    const perPage = 1000
    const candidates: Array<{ id: string; email: string; name: string | null }> = []

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error) throw error
      if (!data || data.users.length === 0) break

      for (const u of data.users) {
        if (!u.email || !u.created_at) continue
        if (u.created_at < windowStart || u.created_at > windowEnd) continue
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        const rawName =
          (meta.full_name as string | undefined) ??
          (meta.name as string | undefined) ??
          null
        candidates.push({ id: u.id, email: u.email, name: rawName?.trim() || null })
      }

      if (data.users.length < perPage) break
      page += 1
      if (page > 50) break // hard safety
    }

    let sent = 0
    let skipped = 0
    const errors: string[] = []

    for (const c of candidates) {
      const idempotencyKey = `day-3-checkin-${c.id}`

      // Skip if we've already attempted/sent this template to this recipient.
      const { data: existing } = await admin
        .from('email_send_log')
        .select('id')
        .eq('template_name', 'day-3-checkin')
        .eq('recipient_email', c.email)
        .limit(1)
        .maybeSingle()

      if (existing) {
        skipped += 1
        continue
      }

      const { error } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'day-3-checkin',
          recipientEmail: c.email,
          idempotencyKey,
          templateData: { name: c.name },
          purpose: 'transactional',
        },
      })

      if (error) {
        errors.push(`${c.id}: ${error.message ?? String(error)}`)
      } else {
        sent += 1
      }
    }

    return new Response(
      JSON.stringify({
        windowStart,
        windowEnd,
        candidates: candidates.length,
        sent,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
