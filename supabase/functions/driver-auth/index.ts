import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import { createDriverPasswordHandler, type DriverSession } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') || ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, serviceKey, options)

Deno.serve(createDriverPasswordHandler({
  async candidates(identifier) {
    const { data, error } = await admin.rpc('mobile_account_login_candidates', {
      p_app: 'driver', p_identifier: identifier
    })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Invalid account lookup response')
    return data.flatMap((row: unknown) => {
      if (!row || typeof row !== 'object' || !('auth_user_id' in row) || !('email' in row) ||
        typeof row.auth_user_id !== 'string' || typeof row.email !== 'string') return []
      return [{ auth_user_id: row.auth_user_id, email: row.email }]
    })
  },
  async signIn(email, password) {
    const client = createClient(url, anonKey, options)
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error?.code === 'invalid_credentials') return null
    if (error) throw error
    if (!data.session) throw new Error('Missing driver login session')
    return data.session satisfies DriverSession
  },
  async admitted(authUserId) {
    const { data, error } = await admin.rpc('mobile_driver_account_identity', { p_auth_user_id: authUserId })
    if (error) throw error
    return typeof data === 'string' && Boolean(data)
  },
  async revoke(token) {
    const { error } = await admin.auth.admin.signOut(token, 'local')
    if (error) throw error
  }
}))
