import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const POLICY_VERSION = 'July 2026'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify caller is an admin.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
    const roleList = (roles ?? []).map((r: any) => r.role)
    if (!roleList.includes('admin') && !roleList.includes('super_admin')) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let dryRun = false
    try {
      const body = await req.json()
      if (body?.dryRun === true) dryRun = true
    } catch { /* no body */ }

    // Fetch all active participants with email.
    const { data: participants, error: pErr } = await admin
      .from('participants')
      .select('id, user_id, email, full_name')
      .eq('is_active', true)
      .not('email', 'is', null)

    if (pErr) throw pErr

    // Deduplicate by lowercased email.
    const byEmail = new Map<string, { user_id: string | null; email: string; full_name: string | null }>()
    for (const p of participants ?? []) {
      const em = (p.email ?? '').trim().toLowerCase()
      if (!em) continue
      if (!byEmail.has(em)) {
        byEmail.set(em, { user_id: p.user_id ?? null, email: p.email!, full_name: p.full_name ?? null })
      }
    }

    // Filter out ones already notified for this policy version.
    const emails = Array.from(byEmail.keys())
    const { data: already } = await admin
      .from('policy_notifications')
      .select('recipient_email')
      .eq('policy_version', POLICY_VERSION)
      .in('recipient_email', emails)
    const alreadySet = new Set((already ?? []).map((r: any) => (r.recipient_email as string).toLowerCase()))
    const allToSend = Array.from(byEmail.entries()).filter(([em]) => !alreadySet.has(em))

    // Cap per invocation to stay within Edge Function wall-time limits.
    // Remaining recipients will be picked up on the next click (dedup via policy_notifications).
    const MAX_PER_INVOCATION = 25
    const CHUNK_SIZE = 5
    const toSend = allToSend.slice(0, MAX_PER_INVOCATION)
    const remainingAfter = Math.max(0, allToSend.length - toSend.length)

    if (dryRun) {
      return new Response(JSON.stringify({
        eligible: allToSend.length,
        totalParticipants: byEmail.size,
        alreadySent: alreadySet.size,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    let sent = 0
    const errors: string[] = []

    async function sendOne([em, info]: [string, { user_id: string | null; email: string; full_name: string | null }]) {
      const idempotencyKey = `policy-update-2026-07-${em}`
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            templateName: 'policy-update-2026-07',
            recipientEmail: info.email,
            idempotencyKey,
            templateData: { name: info.full_name },
            purpose: 'transactional',
          }),
        })
        if (!resp.ok) {
          const text = await resp.text().catch(() => '')
          errors.push(`${em}: ${resp.status} ${text.slice(0, 200)}`)
          return
        }
        await admin.from('policy_notifications').insert({
          user_id: info.user_id,
          recipient_email: info.email,
          policy_version: POLICY_VERSION,
        })
        sent += 1
      } catch (e) {
        errors.push(`${em}: ${(e as Error).message}`)
      }
    }

    // Parallelize in small chunks so we don't hammer the queue or hit resource limits.
    for (let i = 0; i < toSend.length; i += CHUNK_SIZE) {
      const chunk = toSend.slice(i, i + CHUNK_SIZE)
      await Promise.all(chunk.map(sendOne))
    }

    return new Response(JSON.stringify({
      eligible: toSend.length,
      sent,
      errors,
      policyVersion: POLICY_VERSION,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
