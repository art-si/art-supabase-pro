import type {
  PayableMatchField,
  PayableMatchOperator,
  PayableMatchRule
} from '@/api/payable-reference'

export const payableMatchFields: Array<{
  value: PayableMatchField
  label: string
  type: 'reference' | 'text' | 'date' | 'number'
}> = [
  { value: 'supplier_id', label: '往来单位', type: 'reference' },
  { value: 'counterparty_id', label: '统一往来单位（主数据已确认）', type: 'reference' },
  { value: 'currency_code', label: '币种', type: 'text' },
  { value: 'project_id', label: '项目', type: 'reference' },
  { value: 'source_id', label: '关联财务应付标识', type: 'reference' },
  { value: 'organization_id', label: '结算组织', type: 'reference' },
  { value: 'document_no', label: '单据编号', type: 'text' },
  { value: 'source_document_no', label: '源单据号', type: 'text' },
  { value: 'business_date', label: '业务日期', type: 'date' },
  { value: 'amount', label: '单据金额（含折扣）', type: 'number' }
]

export const payableMatchOperators: Array<{ value: PayableMatchOperator; label: string }> = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'contains', label: '包含' },
  { value: 'starts_with', label: '开头为' }
]

export function newPayableMatchRule(field: PayableMatchField = 'supplier_id'): PayableMatchRule {
  return { primaryField: field, secondaryField: field, operator: 'eq', emptyMatches: false }
}

export function allowedPayableMatchOperators(rule: PayableMatchRule): PayableMatchOperator[] {
  const primary = payableMatchFields.find((field) => field.value === rule.primaryField)
  const secondary = payableMatchFields.find((field) => field.value === rule.secondaryField)
  if (!primary || !secondary || primary.type !== secondary.type) return []
  if (primary.type === 'date' || primary.type === 'number')
    return ['eq', 'ne', 'lt', 'lte', 'gt', 'gte']
  return primary.type === 'text' ? ['eq', 'ne', 'contains', 'starts_with'] : ['eq', 'ne']
}

export function validatePayableMatchRules(rules: PayableMatchRule[] | undefined): string {
  if (!rules?.length || rules.length > 20) return '请配置 1 至 20 项核销匹配条件'
  for (const [index, rule] of rules.entries()) {
    if (!allowedPayableMatchOperators(rule).includes(rule.operator))
      return `第 ${index + 1} 条规则的字段类型或匹配关系不兼容，请重新选择`
  }
  return ''
}
