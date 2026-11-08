import type { SupabaseClient } from '@supabase/supabase-js'

/** Reuse the same authenticated Pro profile check in Edge and the local server. */
export async function resolveBffProUser(client: SupabaseClient, authorization: string) {
  const { data, error } = await client.auth.getUser(authorization.slice(7))
  if (error || !data.user) return null
  const profile = await client
    .from('sys_user')
    .select('id')
    .eq('auth_user_id', data.user.id)
    .eq('status', '1')
    .is('deleted_at', null)
    .maybeSingle()
  return profile.error || !profile.data ? null : { id: data.user.id }
}
