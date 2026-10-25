import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createOAuthProviderBridge } from '../_shared/oauth-provider-bridge.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/u, '') || ''
const callbackUrl =
  Deno.env.get('OAUTH_BRIDGE_CALLBACK_URL')?.trim() ||
  (supabaseUrl ? `${supabaseUrl}/auth/v1/callback` : '')
const issuer = supabaseUrl
  ? `${supabaseUrl}/functions/v1/oauth-provider-bridge`
  : 'oauth-provider-bridge'

const deriveSigningSecret = async (): Promise<string> => {
  const explicitSecret = Deno.env.get('OAUTH_BRIDGE_SIGNING_SECRET')?.trim() || ''
  if (explicitSecret) return explicitSecret

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  if (!serviceRoleKey || !supabaseUrl) return ''
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serviceRoleKey),
    'HKDF',
    false,
    ['deriveBits']
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(supabaseUrl),
      info: new TextEncoder().encode('art-supabase-pro/oauth-provider-bridge/v1')
    },
    keyMaterial,
    256
  )
  const bytes = new Uint8Array(derivedBits)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const handler = createOAuthProviderBridge({
  callbackUrl,
  issuer,
  signingSecret: await deriveSigningSecret(),
  wecomAgentId: Deno.env.get('WECOM_AGENT_ID')?.trim()
})

Deno.serve(handler)
