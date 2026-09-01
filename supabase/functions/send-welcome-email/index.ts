import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

// Sends the welcome email to the authenticated caller. The recipient is always
// derived from the caller's JWT — never from the request body.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    const user = userData?.user
    if (userErr || !user?.email) return json({ error: 'Unauthorized' }, 401)

    let name: string | null = null
    try {
      const body = await req.json()
      const raw = body?.templateData?.name ?? body?.name
      if (typeof raw === 'string' && raw.trim()) name = raw.trim().slice(0, 120)
    } catch {
      // no body
    }
    if (!name) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const metaName = (meta.full_name as string | undefined) ?? (meta.name as string | undefined)
      name = metaName?.trim() || null
    }

    const result = await sendAppEmail('welcome', user.email, {
      templateData: { name },
      idempotencyKey: `welcome-${user.id}`,
    })

    return json({ success: result.sent, reason: result.sent ? undefined : result.reason })
  } catch (error) {
    console.error('send-welcome-email failed', error)
    return json({ error: 'Failed to send welcome email' }, 500)
  }
})
