import { createClient } from '@supabase/supabase-js'
import { createBffGatewayHandler } from '../_shared/bff-gateway-handler.ts'
import { resolveBffProUser } from '../_shared/bff-pro-user.ts'

// This dedicated signing secret never enters the browser or a client build.
const handler = createBffGatewayHandler({
  bffUrl: Deno.env.get('BFF_SERVICE_URL') ?? '',
  bridgeSecret: Deno.env.get('BFF_PRO_BRIDGE_SECRET') ?? '',
  allowedOrigins: (Deno.env.get('BFF_PRO_ALLOWED_ORIGINS') ?? 'https://art-si.github.io')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  resolveUser: async (authorization) => {
    const client = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    )
    return resolveBffProUser(client, authorization)
  }
})

Deno.serve(handler)
