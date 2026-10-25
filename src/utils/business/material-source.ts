const MATERIAL_SOURCE_LABELS: Record<string, string> = {
  purchase: '采购',
  purchased: '采购',
  self_made: '自制',
  outsourcing: '委外'
}

export function formatMaterialSource(value: string | null | undefined): string {
  if (!value) return '—'
  return MATERIAL_SOURCE_LABELS[value] || '未识别来源'
}
