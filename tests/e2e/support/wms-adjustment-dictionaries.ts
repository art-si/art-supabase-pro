export const wmsAdjustmentTypePairs = [
  ['bin_move', '仓位移动'],
  ['material_convert', '物料转换'],
  ['batch_convert', '批次转换'],
  ['status_convert', '库存状态转换'],
  ['unit_convert', '计量单位转换'],
  ['attribute_convert', '其他属性转换']
] as const

export const wmsAdjustmentTypeRows = wmsAdjustmentTypePairs.map(([value, label], sort) => ({
  id: `adjustment-type-${value}`,
  label,
  value,
  status: '1',
  sort,
  dict_type_table: { code: 'wmsAdjustmentType', name: '库存调整类型' }
}))
