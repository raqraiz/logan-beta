# Welcome Email on Signup

Send a branded welcome email through Lovable Emails the moment a user successfully creates an account.

## What to build

1. **Set up app-email infrastructure** (one-time)
   - Provision pgmq queues, send log, suppression list, queue worker, and unsubscribe handler on top of the existing verified `notify.asklogan.ai` domain.
   - Scaffolds `send-transactional-email`, `handle-email-unsubscribe`, `handle-email-suppression`, and the template registry.

2. **Welcome email template** (`welcome.tsx`)
   - Subject: `Welcome to Logan 💚`
   - Greeting: `Hi {name}, welcome to Logan 💚` — falls back to `Hi there, welcome to Logan 💚` when no name is provided.
   - Body copy: exactly the text you supplied, including the contacts/Not-Spam ask, the asklogan.ai CTA, the feedback line, and Raquella's signature.
   - Styled to match Logan: dark teal accent (`#15B88C`), DM Sans, white email body (required by email clients), generous spacing, plain-text fallback auto-generated.
   - Registered in the template registry as `welcome`.

3. **Trigger on successful signup**
   - In `src/components/chat/InlineChatAuth.tsx`, immediately after a successful `supabase.auth.signUp` call (right where the "Welcome to Logan 🎉" toast fires), fire-and-forget invoke `send-transactional-email` with:
     - `templateName: "welcome"`
     - `recipientEmail: email.trim()`
     - `idempotencyKey: \`welcome-${data.user.id}\`` (prevents duplicate sends on retry)
     - `templateData: { name: fullName.trim() || null }`
   - Wrap in try/catch so an email hiccup never blocks signup.
   - No changes to `auth-email-hook` — the confirm-email auth template still sends separately.

4. **Unsubscribe page**
   - Add a small branded route (e.g. `/unsubscribe`) that reads the `token` query param, validates via `handle-email-unsubscribe`, and shows confirm/success/invalid states. Required so the auto-appended footer links land in the app.

5. **Deploy**
   - Deploy `send-transactional-email`, `handle-email-unsubscribe`, `handle-email-suppression`, and `process-email-queue` so the welcome email starts flowing immediately.

## Notes

- Sender will be `Logan <noreply@asklogan.ai>` via the verified `notify.asklogan.ai` infrastructure.
- The system automatically appends the legally-required unsubscribe footer; the template body itself stays clean.
- Existing Supabase auth confirmation email (from `auth-email-hook`) is untouched and continues to send in parallel.
- Delivery can be monitored in Cloud → Emails (and via `email_send_log`).
