// deno-lint-ignore-file no-explicit-any
/** Partner heads-ups: on for everyone when the flag is on, otherwise admin accounts only. */
export async function partnerHeadsupFlagOn(admin: any): Promise<boolean> {
  const { data } = await admin.from("feature_flags").select("enabled").eq("key", "partner_headsup").maybeSingle();
  return !!data?.enabled;
}
export async function partnerHeadsupAdminIds(admin: any): Promise<Set<string>> {
  const { data } = await admin.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
  return new Set((data ?? []).map((r: any) => r.user_id));
}
export async function partnerHeadsupVisibleFor(admin: any, userId: string): Promise<boolean> {
  if (await partnerHeadsupFlagOn(admin)) return true;
  return (await partnerHeadsupAdminIds(admin)).has(userId);
}
