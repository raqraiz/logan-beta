// Public endpoint that returns a 1x1 transparent GIF and records an email open.
// Embedded as a tracking pixel in outgoing transactional emails.
import { createClient } from 'npm:@supabase/supabase-js@2'

// 1x1 transparent GIF
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
])

const pixelHeaders = {
  'Content-Type': 'image/gif',
  'Content-Length': String(PIXEL.byteLength),
  'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const mid = url.searchParams.get('mid')
  const tpl = url.searchParams.get('tpl') ?? null
  const rcpt = url.searchParams.get('rcpt') ?? null

  // Always return the pixel; never fail the image response.
  const respond = () =>
    new Response(PIXEL, { status: 200, headers: pixelHeaders })

  if (!mid || mid.length > 200) return respond()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return respond()
    const supabase = createClient(supabaseUrl, serviceKey)

    const ua = req.headers.get('user-agent')?.slice(0, 500) ?? null
    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      null

    await supabase.from('email_opens').insert({
      message_id: mid,
      template_name: tpl,
      recipient_email: rcpt ? decodeURIComponent(rcpt).toLowerCase() : null,
      user_agent: ua,
      ip,
    })
  } catch (e) {
    console.error('track-email-open insert failed', e)
  }

  return respond()
})
