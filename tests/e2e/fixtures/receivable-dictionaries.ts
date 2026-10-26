const definitions: Record<string, Array<[string, string]>> = {
  arDocumentKind: [
    ['estimate', '暂估应收'],
    ['financial', '财务应收'],
    ['reversal', '暂估冲回']
  ],
  arDocumentStatus: [
    ['draft', '草稿'],
    ['submitted', '已提交'],
    ['approved', '已审核'],
    ['confirmed', '已收款'],
    ['paid', '已付款'],
    ['reversed', '已反核销']
  ],
  arViewMode: [
    ['document', '按单据'],
    ['line', '按明细']
  ],
  arPartialStatus: [
    ['none', '未核销'],
    ['partial', '部分核销'],
    ['full', '已核销']
  ],
  arSettlementMethod: [
    ['cash', '现金'],
    ['bank_transfer', '电汇'],
    ['cash_check', '现金支票'],
    ['transfer_check', '转账支票']
  ],
  commonBoolean: [
    ['false', '否'],
    ['true', '是']
  ]
}

export const receivableDictionaryRows = Object.entries(definitions).flatMap(([typeCode, values]) =>
  values.map(([value, label], index) => ({
    id: `${typeCode}-${value}`,
    type_id: `type-${typeCode}`,
    value,
    label,
    status: '1',
    sort: index,
    code:
      typeCode === 'commonBoolean'
        ? value === 'true'
          ? 'commonBooleanTrue'
          : 'commonBooleanFalse'
        : value,
    tag_type: '',
    dict_type_table: { code: typeCode, name: typeCode }
  }))
)
