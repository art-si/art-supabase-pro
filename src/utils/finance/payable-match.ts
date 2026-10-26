import type {
  PayableMatchField,
  PayableMatchOperator,
  PayableMatchRule,
  PayableReference,
  PayableRelationRuleConfig,
  PayableWriteoffRelation
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

export function describePayableMatchRule(rule: PayableMatchRule): string {
  const primary =
    payableMatchFields.find((field) => field.value === rule.primaryField)?.label || '未识别字段'
  const secondary =
    payableMatchFields.find((field) => field.value === rule.secondaryField)?.label || '未识别字段'
  const operator =
    payableMatchOperators.find((item) => item.value === rule.operator)?.label || '未识别关系'
  return `${primary} ${operator} ${secondary}（${rule.emptyMatches ? '允许空值' : '空值不匹配'}）`
}

export function newPayableRelationConfig(
  relation: PayableWriteoffRelation
): PayableRelationRuleConfig {
  return {
    relation,
    description: '',
    rules: [
      newPayableMatchRule(relation === 'payable_receivable' ? 'counterparty_id' : 'supplier_id'),
      newPayableMatchRule('currency_code')
    ]
  }
}

export function isPayableWriteoffRelation(value: string): value is PayableWriteoffRelation {
  return [
    'payable_payment',
    'payment_refund',
    'payable_receivable',
    'payable_red_blue',
    'payable_refund'
  ].includes(value)
}

export function payableSchemeRules(
  scheme: PayableReference,
  relation: PayableWriteoffRelation
): PayableMatchRule[] | undefined {
  return scheme.relationRules == null
    ? scheme.rules
    : scheme.relationRules.find((config) => config.relation === relation)?.rules
}

export function payableSchemeApplies(
  scheme: PayableReference,
  relation: PayableWriteoffRelation
): boolean {
  return (
    scheme.relationRules == null ||
    scheme.relationRules.some((config) => config.relation === relation)
  )
}

export function validatePayableRelationConfigs(
  configs: PayableRelationRuleConfig[] | null | undefined
): string {
  if (!configs?.length || configs.length > 5) return '请配置 1 至 5 种核销关系'
  for (const [index, config] of configs.entries()) {
    if (!isPayableWriteoffRelation(config.relation)) return '请选择支持的核销关系'
    if (configs.findIndex((entry) => entry.relation === config.relation) !== index)
      return '每种核销关系只能配置一次'
    const invalid = validatePayableMatchRules(config.rules)
    if (invalid) return `第 ${index + 1} 种核销关系：${invalid}`
    if ((config.description?.length || 0) > 1000) return '核销关系说明不能超过 1000 字'
  }
  return ''
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
