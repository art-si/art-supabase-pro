/** Keep historical missing actor markers visible without displaying raw sentinels. */
export function formatAuditActorName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) return '—'
  return name.toLowerCase() === 'unknown' ? '创建人待核对' : name
}
