export interface AiEdgeAppUser {
  tenant_id: string
  user_email: string
  status: string | null
}

export function extractAiEdgeBearerToken(authHeader: string): string {
  return authHeader.replace(/^Bearer\s+/i, '').trim()
}

export function isActiveAiEdgeAppUser(value: unknown): value is AiEdgeAppUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.tenant_id === 'string' &&
    Boolean(candidate.tenant_id) &&
    typeof candidate.user_email === 'string' &&
    candidate.status !== '0'
  )
}
