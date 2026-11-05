type MovementTypeOption = { value: string; label: string }

export function formatWmsMovementType(
  value?: string | null,
  options: readonly MovementTypeOption[] = []
): string {
  if (!value) return '—'
  return options.find((item) => item.value === value)?.label || value
}
