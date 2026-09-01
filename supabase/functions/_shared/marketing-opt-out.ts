// Marketing / announcement opt-out helper.
//
// Announcement-style broadcasts (policy updates, AMA invites) must skip any
// recipient who opted out. Transactional and auth emails (welcome, day-3
// check-in, account deleted, sign-in links) never use this.
//
// Two sources are honoured:
//  - profiles.marketing_opt_out = true  (set when a recipient unsubscribes)
//  - suppressed_emails                  (bounce / complaint / unsubscribe)

// deno-lint-ignore no-explicit-any
type Admin = any

/**
 * Returns the lowercased set of addresses that must NOT receive
 * marketing/announcement email.
 */
export async function getMarketingOptOuts(
  admin: Admin,
  emails: string[],
): Promise<Set<string>> {
  const optedOut = new Set<string>()
  const list = emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (list.length === 0) return optedOut

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('email')
    .eq('marketing_opt_out', true)
  if (profilesError) {
    console.error('Failed to load marketing opt-outs', profilesError.message)
    throw new Error('Failed to load marketing opt-outs')
  }
  for (const row of profiles ?? []) {
    const em = (row.email ?? '').trim().toLowerCase()
    if (em) optedOut.add(em)
  }

  const { data: suppressed, error: suppressedError } = await admin
    .from('suppressed_emails')
    .select('email')
  if (suppressedError) {
    console.error('Failed to load suppressed emails', suppressedError.message)
    throw new Error('Failed to load suppressed emails')
  }
  for (const row of suppressed ?? []) {
    const em = (row.email ?? '').trim().toLowerCase()
    if (em) optedOut.add(em)
  }

  return new Set(list.filter((em) => optedOut.has(em)))
}
