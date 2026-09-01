import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from './transactional-email-templates/registry.ts'

// Server-only app-email sender.
//
// Mirrors the scaffolded sendTemplateEmail helper but renders and sends
// directly through @lovable.dev/email-js because this project injects a
// per-send open-tracking pixel into the rendered HTML (see the
// track-email-open function and the email_opens table) — a send-time HTML
// post-processing step the registry-only helper cannot express.
//
// Delivery, retries, suppression and unsubscribe are handled by Lovable.

const SITE_NAME = 'Logan'
// Verified sender subdomain FQDN — never the root domain.
const SENDER_DOMAIN = 'notify.asklogan.ai'
// Domain shown in the From: header (cosmetic).
const FROM_DOMAIN = 'asklogan.ai'

export type SendAppEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: 'recipient_suppressed'; messageId: string }

export interface SendAppEmailOptions {
  templateData?: Record<string, unknown>
  idempotencyKey?: string
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function logSend(row: {
  message_id: string | null
  template_name: string
  recipient_email: string
  status: 'sent' | 'suppressed' | 'failed'
  error_message?: string
}) {
  const { error } = await adminClient().from('email_send_log').insert(row)
  if (error) {
    console.error('Failed to write email_send_log', {
      code: error.code,
      message: error.message,
    })
  }
}

/**
 * Renders a registered template, injects the open-tracking pixel and sends it
 * through Lovable's managed email API. A suppressed recipient is an expected
 * outcome ({ sent: false }); any other failure throws.
 */
export async function sendAppEmail(
  templateName: string,
  to: string,
  options: SendAppEmailOptions = {},
): Promise<SendAppEmailResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
    )
  }

  const recipient = (template.to as string | undefined) || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  let html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const messageId = crypto.randomUUID()

  // Open-tracking pixel (project customization).
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const projectRef = (supabaseUrl.match(/^https?:\/\/([^.]+)\./) || [])[1] || ''
  if (projectRef) {
    const pixelUrl =
      `https://${projectRef}.supabase.co/functions/v1/track-email-open` +
      `?mid=${encodeURIComponent(messageId)}` +
      `&tpl=${encodeURIComponent(templateName)}` +
      `&rcpt=${encodeURIComponent(recipient.toLowerCase())}`
    const pixelTag =
      `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;text-decoration:none;" />`
    html = html.includes('</body>')
      ? html.replace('</body>', `${pixelTag}</body>`)
      : `${html}${pixelTag}`
  }

  try {
    await sendLovableEmail(
      {
        to: recipient,
        from: `${SITE_NAME} <feedback@${FROM_DOMAIN}>`,
        reply_to: `feedback@${FROM_DOMAIN}`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: templateName,
        idempotency_key: options.idempotencyKey || messageId,
        message_id: messageId,
      },
      { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') },
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      await logSend({
        message_id: messageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'suppressed',
      })
      return { sent: false, reason: 'recipient_suppressed', messageId }
    }
    const errorMsg = error instanceof Error ? error.message : String(error)
    await logSend({
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'failed',
      error_message: errorMsg.slice(0, 1000),
    })
    throw error
  }

  await logSend({
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipient,
    status: 'sent',
  })

  return { sent: true, messageId }
}
