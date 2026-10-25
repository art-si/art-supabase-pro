/** Labels for persisted stock types, including codes absent from older tenant dictionaries. */
export const WMS_STOCK_TYPE_LABELS: Record<string, string> = {
  normal: '普通',
  gift: '赠品',
  rd_trial: '研发试制',
  asset: '资产',
  vmi: 'VMI',
  consignment: '委托代销',
  outsourced: '委托加工',
  entrusted_processing: '受托加工',
  internal: '内协加工',
  bonded: '保税',
  customs: '保税'
}
