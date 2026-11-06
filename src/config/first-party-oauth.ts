import type { FirstPartyOAuthClient } from '@/utils/oauth-authorization'

/** Explicitly trusted internal clients; IDs are public and never contain client secrets. */
export const firstPartyOAuthClients: readonly FirstPartyOAuthClient[] = [
  {
    clientId: 'd24d98a7-22a9-442b-83ed-34c7ffa60515',
    redirectUri: 'http://localhost:3010/api/auth/callback',
    scopes: ['email', 'profile']
  }
]
