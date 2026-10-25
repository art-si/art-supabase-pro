interface OwnerOption {
  id: string
  name: string
}

/** Resolve against the drawer's tenant-scoped options without exposing internal IDs. */
export function formatWmsOwnerName(
  ownerType: string,
  ownerId: string | null | undefined,
  suppliers: readonly OwnerOption[],
  customers: readonly OwnerOption[]
): string {
  if (ownerType === 'self') return '自有'
  if (!ownerId) return '—'
  const options = ownerType === 'supplier' ? suppliers : ownerType === 'customer' ? customers : []
  return options.find((option) => option.id === ownerId)?.name || '货主资料不可用'
}
