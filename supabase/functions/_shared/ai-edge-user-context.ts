import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'
import {
  extractAiEdgeBearerToken,
  isActiveAiEdgeAppUser,
  type AiEdgeAppUser
} from './ai-edge-user-context-policy.ts'

export interface AiEdgeContextFailure {
  ok: false
  code: 'unauthorized' | 'forbidden'
  message: string
  status: 401 | 403
}

export interface AuthenticatedAiEdgeRequest {
  ok: true
  user: User
  admin: SupabaseClient
  userClient: SupabaseClient
}

export interface AuthorizedAiEdgeUserContext extends AuthenticatedAiEdgeRequest {
  appUser: AiEdgeAppUser
}

const CLIENT_AUTH_OPTIONS = {
  autoRefreshToken: false,
  persistSession: false
}

export async function authenticateAiEdgeRequest(
  request: Request,
  invalidSessionMessage = 'Invalid or expired session'
): Promise<AuthenticatedAiEdgeRequest | AiEdgeContextFailure> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = request.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
    return {
      ok: false,
      code: 'unauthorized',
      message: 'Authentication required',
      status: 401
    }
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: CLIENT_AUTH_OPTIONS })
  const token = extractAiEdgeBearerToken(authHeader)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data.user) {
    return {
      ok: false,
      code: 'unauthorized',
      message: invalidSessionMessage,
      status: 401
    }
  }

  return {
    ok: true,
    user: data.user,
    admin: createClient(supabaseUrl, serviceRoleKey, { auth: CLIENT_AUTH_OPTIONS }),
    userClient: createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: CLIENT_AUTH_OPTIONS
    })
  }
}

export async function authorizeAiEdgeAppUser(
  authenticated: AuthenticatedAiEdgeRequest,
  forbiddenMessage = 'Active application user is required'
): Promise<AuthorizedAiEdgeUserContext | AiEdgeContextFailure> {
  const { data, error } = await authenticated.admin
    .from('sys_user')
    .select('tenant_id,user_email,status')
    .eq('auth_user_id', authenticated.user.id)
    .maybeSingle()
  if (error || !isActiveAiEdgeAppUser(data)) {
    return {
      ok: false,
      code: 'forbidden',
      message: forbiddenMessage,
      status: 403
    }
  }

  return { ...authenticated, appUser: data }
}
